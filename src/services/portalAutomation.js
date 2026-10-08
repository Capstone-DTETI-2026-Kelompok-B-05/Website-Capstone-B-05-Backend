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

function parseMessage(message, topic) {
  try {
    return JSON.parse(message.toString());
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
    if (payload.mode === undefined) return;

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
    if (this.operationMode === 'manual') return;

    if (payload.zona === true) {
      this.cancelCloseTimer();
      if (PRIORITY_VEHICLE_SET.has(payload.jenis) && !this.portalOpen) {
        this.sendCommand({ aksi: 'buka', jenis: payload.jenis });
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
    if (command.aksi === 'buka') this.portalOpen = true;
    if (command.aksi === 'tutup') this.portalOpen = false;
    return Promise.resolve(this.publishCommand(command)).catch((error) => {
      console.error('Unable to publish portal automation command:', error);
    });
  }

  stop() {
    this.cancelCloseTimer();
  }
}

export function createPortalAutomation() {
  const client = mqtt.connect(env.mqttBrokerUrl, {
    username: env.mqttUsername,
    password: env.mqttPassword,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000
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
    client.subscribe([MQTT_TOPICS.detection, MQTT_TOPICS.portalCommand, MQTT_TOPICS.portalStatus], { qos: 1 }, (error) => {
      if (error) console.error('Unable to subscribe to portal automation topics:', error);
    });
  });
  client.on('error', (error) => console.error('Portal automation MQTT error:', error));
  client.on('message', (topic, message) => {
    try {
      const payload = parseMessage(message, topic);
      if (topic === MQTT_TOPICS.detection) controller.handleDetection(payload);
      else if (topic === MQTT_TOPICS.portalCommand) controller.handleCommand(payload);
      else if (topic === MQTT_TOPICS.portalStatus) controller.handleStatus(payload);
    } catch (error) {
      console.error(`Unable to process MQTT message on ${topic}:`, error);
    }
  });

  return {
    controller,
    stop() {
      controller.stop();
      client.end(true);
    }
  };
}
