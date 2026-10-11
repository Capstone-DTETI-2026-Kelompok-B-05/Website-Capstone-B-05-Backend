import ort from 'onnxruntime-node';
import sharp from 'sharp';
import path from 'node:path';
import { env } from '../config/env.js';

const MODEL_WIDTH = 640;
const MODEL_HEIGHT = 640;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const MAX_DETECTIONS = 20;

let sessionPromise;

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

function outputDetections(output, confidenceThreshold) {
  const [batch, channels, candidates] = output.dims;
  if (batch !== 1 || channels < 5) {
    throw new Error(`Unsupported ONNX output shape: [${output.dims.join(', ')}]`);
  }

  const detections = [];
  for (let index = 0; index < candidates; index += 1) {
    const x = output.data[index];
    const y = output.data[candidates + index];
    const width = output.data[candidates * 2 + index];
    const height = output.data[candidates * 3 + index];
    const confidence = output.data[candidates * 4 + index];
    if (!Number.isFinite(confidence) || confidence < confidenceThreshold) continue;

    detections.push({
      conf: Math.max(0, Math.min(1, confidence)),
      left: x - width / 2,
      top: y - height / 2,
      right: x + width / 2,
      bottom: y + height / 2
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
  const receivedAt = metadata.receivedAt instanceof Date ? metadata.receivedAt : new Date();
  const latency = Math.max(0, Date.now() - receivedAt.getTime());

  return detections.map((detection, index) => ({
    id: `${metadata.cameraId ?? 'camera'}-${Date.now()}-${index}`,
    jenis: env.onnxVehicleType,
    conf: detection.conf,
    zona: true,
    strobo: false,
    kecerahan: brightness / (info.width * info.height),
    latensi: latency
  }));
}
