import mqtt from 'mqtt';
import { env } from '../config/env.js';
import { MQTT_TOPICS, validateDetectionPayload, validatePortalCommandPayload } from './mqttPublisher.js';

export const AUTO_CLOSE_DELAY_MS = 1500;
export const PRIORITY_VEHICLE_TYPES = Object.freeze(['bus', 'ambulans', 'damkar']);

const PRIORITY_VEHICLE_SET = new Set(PRIORITY_VEHICLE_TYPES);

function normalizeMode(mode) {
  if (mode === 'manual') return 'manual';
  if (mode === 'otomatis' || mode === 'automatic' || mode === 'auto') return 'otomatis';
  return null;
}

const JSON_LITERAL_PATTERN = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;

export function parseMqttPayload(message) {
  const payloadText = Buffer.isBuffer(message) ? message.toString() : String(message);

  try {
    return JSON.parse(payloadText);
  } catch (jsonError) {
    const normalizedPayload = payloadText
      .trim()
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/(:\s*)([^,}\s]+)\s*(?=,|})/g, (match, prefix, value) => {
        if (value.startsWith('"') && value.endsWith('"')) return `${prefix}${value}`;
        return JSON_LITERAL_PATTERN.test(value) ? `${prefix}${value}` : `${prefix}"${value}"`;
      });

    try {
      return JSON.parse(normalizedPayload);
    } catch (normalizedJsonError) {
      throw new Error(
        `Invalid MQTT payload: ${normalizedJsonError.message}; original JSON error: ${jsonError.message}`
      );
    }
  }
}

function parseMessage(message, topic) {
  try {
    return parseMqttPayload(message);
  } catch (error) {
    throw new Error(`Invalid JSON received on ${topic}: ${error.message}`);
  }
}

export class PortalAutomationController {
  constructor({ publishCommand, closeDelayMs = AUTO_CLOSE_DELAY_MS, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
    this.publishCommand = publishCommand;
    this.closeDelayMs = closeDelayMs;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.operationMode = 'otomatis';
    this.portalOpen = false;
    this.closeTimer = null;
  }

  setPublishCommand(publishCommand) {
    this.publishCommand = publishCommand;
  }

  handleCommand(payload) {
    validatePortalCommandPayload(payload);
    if (payload.mode === undefined) {
      this.operationMode = 'otomatis';
      return;
    }

    const mode = normalizeMode(payload.mode);
    if (!mode) return;

    this.operationMode = mode;
    if (mode === 'manual') this.cancelCloseTimer();
  }

  handleStatus(payload) {
    if (!payload || typeof payload.terbuka !== 'boolean') {
      throw new Error('Portal status payload must contain a boolean terbuka');
    }
    this.portalOpen = payload.terbuka;
  }

  handleDetection(payload) {
    validateDetectionPayload(payload);
    if (this.operationMode === 'manual') {
      console.log('Portal automation ignored detection because mode is manual:', payload.id);
      return;
    }

    if (payload.zona === true) {
      this.cancelCloseTimer();
      if (PRIORITY_VEHICLE_SET.has(payload.jenis) && !this.portalOpen) {
        console.log('Portal automation opening portal for detection:', {
          id: payload.id,
          jenis: payload.jenis,
          conf: payload.conf,
          zona: payload.zona
        });
        this.sendCommand({ aksi: 'buka' });
      } else {
        console.log('Portal automation did not open portal:', {
          id: payload.id,
          jenis: payload.jenis,
          portalOpen: this.portalOpen
        });
      }
      return;
    }

    this.scheduleClose();
  }

  scheduleClose() {
    this.cancelCloseTimer();
    this.closeTimer = this.setTimeoutFn(() => {
      this.closeTimer = null;
      if (this.operationMode === 'otomatis' && this.portalOpen) {
        this.sendCommand({ aksi: 'tutup' });
      }
    }, this.closeDelayMs);
  }

  cancelCloseTimer() {
    if (this.closeTimer !== null) {
      this.clearTimeoutFn(this.closeTimer);
      this.closeTimer = null;
    }
  }

  sendCommand(command) {
    if (typeof this.publishCommand !== 'function') {
      throw new Error('Portal automation publisher is not configured');
    }
    return Promise.resolve(this.publishCommand(command)).catch((error) => {
      console.error('Unable to publish portal automation command:', error);
    });
  }

  stop() {
    this.cancelCloseTimer();
  }
}

export function createPortalAutomation({ onDetection, onPortalStatus } = {}) {
  const client = mqtt.connect(env.mqttBrokerUrl, {
    username: env.mqttUsername,
    password: env.mqttPassword,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000
  });
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const controller = new PortalAutomationController({
    publishCommand: (command) =>
      new Promise((resolve, reject) => {
        client.publish(MQTT_TOPICS.portalCommand, JSON.stringify(command), { qos: 1, retain: false }, (error) => {
          if (error) reject(error);
          else resolve();
        });
      })
  });

  client.on('connect', () => {
    console.log('Portal automation MQTT connected; subscribing to:', [
      MQTT_TOPICS.detection,
      MQTT_TOPICS.portalCommand,
      MQTT_TOPICS.portalStatus
    ]);
    client.subscribe([MQTT_TOPICS.detection, MQTT_TOPICS.portalCommand, MQTT_TOPICS.portalStatus], { qos: 1 }, (error) => {
      if (error) {
        console.error('Unable to subscribe to portal automation topics:', error);
        rejectReady(error);
      } else {
        console.log('Portal automation MQTT subscriptions active');
        resolveReady();
      }
    });
  });
  client.on('error', (error) => {
    console.error('Portal automation MQTT error:', error);
    rejectReady(error);
  });
  client.on('message', (topic, message) => {
    try {
      const payload = parseMessage(message, topic);
      console.log('Portal automation MQTT message received:', topic, payload);
      if (topic === MQTT_TOPICS.detection) controller.handleDetection(payload);
      else if (topic === MQTT_TOPICS.portalCommand) controller.handleCommand(payload);
      else if (topic === MQTT_TOPICS.portalStatus) controller.handleStatus(payload);
      if (topic === MQTT_TOPICS.detection && typeof onDetection === 'function') {
        Promise.resolve(onDetection(payload, controller)).catch((error) => {
          console.error('Unable to record detection analytics:', error);
        });
      } else if (topic === MQTT_TOPICS.portalStatus && typeof onPortalStatus === 'function') {
        Promise.resolve(onPortalStatus(payload, controller)).catch((error) => {
          console.error('Unable to record portal analytics:', error);
        });
      }
    } catch (error) {
      console.error(`Unable to process MQTT message on ${topic}:`, error);
    }
  });

  return {
    controller,
    ready,
    stop() {
      controller.stop();
      client.end(true);
    }
  };
}
