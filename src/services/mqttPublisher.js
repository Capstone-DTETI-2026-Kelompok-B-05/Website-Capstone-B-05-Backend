import mqtt from 'mqtt';
import { env } from '../config/env.js';

export const MQTT_TOPICS = Object.freeze({
  detection: 'busway/deteksi',
  portalStatus: 'busway/portal/status',
  portalCommand: 'busway/portal/perintah'
});

const VEHICLE_TYPES = new Set(['bus', 'ambulans', 'damkar', 'mobil', 'motor', 'truk']);
const PORTAL_TRIGGER_TYPES = new Set(['bus', 'ambulans', 'damkar']);
const PORTAL_MODES = new Set(['manual', 'otomatis', 'automatic', 'auto']);
const PORTAL_ACTIONS = new Set(['buka', 'tutup']);

function assertObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertBoolean(value, field) {
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
}

function assertUnitInterval(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be a number between 0 and 1`);
  }
}

export function validateDetectionPayload(payload) {
  assertObject(payload, 'Detection payload must be an object');
  if (!VEHICLE_TYPES.has(payload.jenis)) throw new Error('jenis is not a supported vehicle type');
  if (typeof payload.id !== 'string' && typeof payload.id !== 'number') {
    throw new Error('id must be a string or number');
  }
  assertUnitInterval(payload.conf, 'conf');
  assertBoolean(payload.zona, 'zona');
  assertBoolean(payload.strobo, 'strobo');
  assertUnitInterval(payload.kecerahan, 'kecerahan');
  if (typeof payload.latensi !== 'number' || !Number.isFinite(payload.latensi) || payload.latensi < 0) {
    throw new Error('latensi must be a non-negative number');
  }
  return payload;
}

export function validatePortalStatusPayload(payload) {
  assertObject(payload, 'Portal status payload must be an object');
  assertBoolean(payload.terbuka, 'terbuka');
  if (!['otomatis', 'manual'].includes(payload.sumber)) {
    throw new Error('sumber must be otomatis or manual');
  }
  return payload;
}

export function validatePortalCommandPayload(payload) {
  assertObject(payload, 'Portal command payload must be an object');
  const hasAction = payload.aksi !== undefined;
  const hasMode = payload.mode !== undefined;
  if (hasAction === hasMode) throw new Error('Command must contain exactly one aksi or mode');
  if (hasAction && !PORTAL_ACTIONS.has(payload.aksi)) {
    throw new Error('aksi must be buka or tutup');
  }
  if (hasMode && !PORTAL_MODES.has(payload.mode)) {
    throw new Error('mode must be manual or otomatis');
  }
  if (payload.aksi === 'buka' && payload.jenis !== undefined && !PORTAL_TRIGGER_TYPES.has(payload.jenis)) {
    throw new Error('Only bus, ambulans, and damkar can trigger portal opening');
  }
  return payload;
}

function brokerOptions() {
  if (!env.mqttUsername || !env.mqttPassword) {
    throw new Error('MQTT_USERNAME and MQTT_PASSWORD are required for broker publishing');
  }
  return {
    username: env.mqttUsername,
    password: env.mqttPassword,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 10000
  };
}

export async function publishMqtt(topic, payload, options = {}) {
  const client = mqtt.connect(env.mqttBrokerUrl, brokerOptions());
  try {
    await new Promise((resolve, reject) => {
      const onConnect = () => {
        client.removeListener('error', onError);
        resolve();
      };
      const onError = (error) => {
        client.removeListener('connect', onConnect);
        reject(error);
      };
      client.once('connect', onConnect);
      client.once('error', onError);
    });

    await new Promise((resolve, reject) => {
      client.publish(topic, JSON.stringify(payload), options, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } finally {
    client.end(true);
  }
}

export function publishDetection(payload) {
  return publishMqtt(MQTT_TOPICS.detection, validateDetectionPayload(payload), { qos: 0, retain: false });
}

export function publishPortalStatus(payload) {
  return publishMqtt(MQTT_TOPICS.portalStatus, validatePortalStatusPayload(payload), { qos: 1, retain: true });
}

export function publishPortalCommand(payload) {
  const validatedPayload = validatePortalCommandPayload(payload);
  const { jenis, ...command } = validatedPayload;
  return publishMqtt(MQTT_TOPICS.portalCommand, command, { qos: 1, retain: false });
}
