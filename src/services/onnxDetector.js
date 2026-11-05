import ort from 'onnxruntime-node';
import sharp from 'sharp';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import Camera from '../../models/Camera.js';

const MODEL_WIDTH = 640;
const MODEL_HEIGHT = 640;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const MAX_DETECTIONS = 20;

let sessionPromise;
const zoneCache = new Map();

function modelPath() {
  return path.resolve(process.cwd(), env.onnxModelPath);
}

async function getSession() {
  sessionPromise ??= ort.InferenceSession.create(modelPath());
  return sessionPromise;
}

function intersectionOverUnion(first, second) {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const firstArea = (first.right - first.left) * (first.bottom - first.top);
  const secondArea = (second.right - second.left) * (second.bottom - second.top);
  return intersection / (firstArea + secondArea - intersection || 1);
}

function nonMaximumSuppression(detections) {
  const selected = [];
  for (const detection of detections.sort((a, b) => b.conf - a.conf)) {
    if (selected.every((item) => intersectionOverUnion(item, detection) < IOU_THRESHOLD)) {
      selected.push(detection);
      if (selected.length === MAX_DETECTIONS) break;
    }

  }
  return selected;
}

function isInsidePolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y))
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
        / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

async function getDetectionZone(cameraId) {
  if (!cameraId) return null;
  const cached = zoneCache.get(cameraId);
  if (cached && cached.expiresAt > Date.now()) return cached.zone;
  if (!mongoose.isValidObjectId(cameraId)) return null;
  const camera = await Camera.findById(cameraId).select('detectionZone').lean();
  const zone = camera?.detectionZone ?? null;
  zoneCache.set(cameraId, { zone, expiresAt: Date.now() + 5000 });
  return zone;
}

export function outputDetections(output, confidenceThreshold, vehicleClasses = env.onnxVehicleClasses) {
  const [batch, firstDimension, secondDimension] = output.dims;
  const isEndToEndOutput = secondDimension === 6;
  if (batch !== 1 || secondDimension < 1 || (!isEndToEndOutput && firstDimension < 5)) {
    throw new Error(`Unsupported ONNX output shape: [${output.dims.join(', ')}]`);
  }
  if (!Array.isArray(vehicleClasses) || vehicleClasses.length === 0) {
    throw new Error('ONNX_VEHICLE_CLASSES must contain at least one vehicle class');
  }

  const channels = isEndToEndOutput ? secondDimension : firstDimension;
  const candidates = isEndToEndOutput ? firstDimension : secondDimension;
  if (!isEndToEndOutput && channels === 5 && vehicleClasses.length > 1) {
    throw new Error(
      `ONNX model output has one class, but ${vehicleClasses.length} vehicle classes are configured; `
      + 'export a multi-class model with 4 + class-score channels'
    );
  }
  const classCount = channels - 4;

  const detections = [];
  let rawMaximumConfidence = 0;
  for (let index = 0; index < candidates; index += 1) {
    const rowOffset = index * 6;
    const x = isEndToEndOutput ? output.data[rowOffset] : output.data[index];
    const y = isEndToEndOutput ? output.data[rowOffset + 1] : output.data[candidates + index];
    const right = isEndToEndOutput
      ? output.data[rowOffset + 2]
      : x + output.data[candidates * 2 + index] / 2;
    const bottom = isEndToEndOutput
      ? output.data[rowOffset + 3]
      : y + output.data[candidates * 3 + index] / 2;
    let classId = 0;
    let confidence = isEndToEndOutput
      ? output.data[rowOffset + 4]
      : output.data[candidates * 4 + index];
    if (isEndToEndOutput) {
      classId = output.data[rowOffset + 5];
    } else if (classCount > 1) {
      confidence = Number.NEGATIVE_INFINITY;
      for (let candidateClassId = 0; candidateClassId < classCount; candidateClassId += 1) {
        const classConfidence = output.data[candidates * (4 + candidateClassId) + index];
        if (classConfidence > confidence) {
          confidence = classConfidence;
          classId = candidateClassId;
        }
      }
    }
    if (Number.isFinite(confidence)) {
      rawMaximumConfidence = Math.max(rawMaximumConfidence, confidence);
    }
    if (!Number.isFinite(confidence) || confidence < confidenceThreshold) continue;
    if (!Number.isInteger(classId) || classId < 0 || classId >= vehicleClasses.length) {
      throw new Error(
        `ONNX model returned class ${classId}, but only ${vehicleClasses.length} vehicle classes are configured`
      );
    }

    detections.push({
      classId,
      jenis: vehicleClasses[classId],
      conf: Math.max(0, Math.min(1, confidence)),
      left: isEndToEndOutput ? x : x - output.data[candidates * 2 + index] / 2,
      top: isEndToEndOutput ? y : y - output.data[candidates * 3 + index] / 2,
      right,
      bottom
    });
  }
  if (process.env.NODE_ENV !== 'production') {
    const confidences = detections.map(({ conf }) => conf);
    console.log('ONNX confidence:', {
      rawMaximum: rawMaximumConfidence,
      maximum: confidences.length > 0 ? Math.max(...confidences) : 0,
      threshold: confidenceThreshold,
      candidatesAboveThreshold: detections.length
    });
  }
  return nonMaximumSuppression(detections);
}

export async function detectFrame(frame, metadata = {}) {
  const startedAt = Date.now();
  const image = sharp(frame, { failOn: 'error' });
  const { data, info } = await image
    .resize(MODEL_WIDTH, MODEL_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const input = new Float32Array(3 * MODEL_WIDTH * MODEL_HEIGHT);
  const planeSize = MODEL_WIDTH * MODEL_HEIGHT;
  let brightness = 0;
  for (let pixel = 0; pixel < planeSize; pixel += 1) {
    const red = data[pixel * 3];
    const green = data[pixel * 3 + 1];
    const blue = data[pixel * 3 + 2];
    input[pixel] = red / 255;
    input[planeSize + pixel] = green / 255;
    input[planeSize * 2 + pixel] = blue / 255;
    brightness += (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  }

  const session = await getSession();
  const result = await session.run({
    [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, MODEL_HEIGHT, MODEL_WIDTH])
  });
  const output = result[session.outputNames[0]];
  const detections = outputDetections(output, env.onnxConfidenceThreshold);
  console.log('ONNX detections:', detections.length, detections);
  const receivedAt = metadata.receivedAt instanceof Date ? metadata.receivedAt : new Date();
  const latency = Math.max(0, Date.now() - receivedAt.getTime());
  const zone = await getDetectionZone(metadata.cameraId);
  const zoneDetections = detections.map(detection => ({
    ...detection,
    zona: zone ? isInsidePolygon({
      x: ((detection.left + detection.right) / 2) / MODEL_WIDTH,
      y: detection.bottom / MODEL_HEIGHT
    }, zone) : true
  }));

  return zoneDetections.map((detection, index) => ({
    "id": `${metadata.cameraId ?? 'camera'}-${Date.now()}-${index}`,
    "jenis": detection.jenis,
    "conf": detection.conf,
    "zona": detection.zona,
    "box": {
      "left": detection.left,
      "top": detection.top,
      "right": detection.right,
      "bottom": detection.bottom
    },
    "strobo": false,
    "kecerahan": brightness / (info.width * info.height),
    "latensi": latency
  }
  
));
}
