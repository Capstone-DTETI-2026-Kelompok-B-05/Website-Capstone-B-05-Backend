import { EventEmitter } from 'node:events';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { jest } from '@jest/globals';

const findById = jest.fn();
const publishDetection = jest.fn().mockResolvedValue(undefined);
const publishPortalStatus = jest.fn().mockResolvedValue(undefined);
const publishPortalCommand = jest.fn().mockResolvedValue(undefined);
const mqttClient = new EventEmitter();
mqttClient.subscribe = jest.fn((topics, options, callback) => callback());
mqttClient.publish = jest.fn((topic, message, options, callback) => callback());
mqttClient.end = jest.fn();
const mqttConnect = jest.fn(() => mqttClient);

jest.unstable_mockModule('../models/User.js', () => ({
  default: { findById }
}));
jest.unstable_mockModule('../src/services/mqttPublisher.js', () => ({
  MQTT_TOPICS: {
    detection: 'busway/deteksi',
    portalStatus: 'busway/portal/status',
    portalCommand: 'busway/portal/perintah'
  },
  publishDetection,
  publishPortalStatus,
  publishPortalCommand,
  validateDetectionPayload: (payload) => payload,
  validatePortalCommandPayload: (payload) => payload
}));
jest.unstable_mockModule('mqtt', () => ({ default: { connect: mqttConnect } }));

const { default: app } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { createPortalAutomation } = await import('../src/services/portalAutomation.js');

const user = {
  _id: { toString: () => 'resilience-user' },
  username: 'resilience-operator',
  role: 'petugas'
};
const token = jwt.sign(
  { sub: 'resilience-user', username: user.username, role: user.role },
  env.jwtSecret
);

const detectionPayload = (cameraId, sequence = 1) => ({
  jenis: 'mobil',
  id: `${cameraId}-${sequence}`,
  conf: 0.91,
  zona: false,
  strobo: false,
  kecerahan: 0.7,
  latensi: 22
});

describe('resilience and security edge cases', () => {
  beforeEach(() => {
    findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    publishDetection.mockClear();
    publishPortalCommand.mockClear();
    mqttConnect.mockClear();
    mqttClient.subscribe.mockClear();
    mqttClient.publish.mockClear();
    mqttClient.end.mockClear();
    mqttClient.removeAllListeners();
  });

  describe('network disruption and MQTT reconnection', () => {
    it('re-subscribes to all portal topics after a disconnect and reconnect', () => {
      const automation = createPortalAutomation();

      mqttClient.emit('connect');
      mqttClient.emit('offline');
      mqttClient.emit('close');
      mqttClient.emit('connect');

      expect(mqttConnect).toHaveBeenCalledWith(
        env.mqttBrokerUrl,
        expect.objectContaining({
          reconnectPeriod: 5000,
          clean: true
        })
      );
      expect(mqttClient.subscribe).toHaveBeenCalledTimes(2);
      expect(mqttClient.subscribe).toHaveBeenLastCalledWith(
        ['busway/deteksi', 'busway/portal/perintah', 'busway/portal/status'],
        { qos: 1 },
        expect.any(Function)
      );

      automation.stop();
      expect(mqttClient.end).toHaveBeenCalledWith(true);
    });

    it('keeps the automation process alive when a malformed MQTT message arrives', () => {
      const automation = createPortalAutomation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        mqttClient.emit('message', 'busway/deteksi', Buffer.from('{"jenis":'));
        mqttClient.emit(
          'message',
          'busway/portal/perintah',
          Buffer.from(JSON.stringify({ mode: 'manual' }))
        );
      }).not.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unable to process MQTT message on busway/deteksi:'),
        expect.any(Error)
      );
      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Unable to process MQTT message on busway/portal/perintah:'),
        expect.anything()
      );

      errorSpy.mockRestore();
      automation.stop();
    });

    it('publishes portal commands at QoS 1 after a priority detection', () => {
      const automation = createPortalAutomation();
      mqttClient.emit('connect');
      mqttClient.emit(
        'message',
        'busway/deteksi',
        Buffer.from(JSON.stringify({
          jenis: 'bus',
          id: 'priority-1',
          conf: 0.99,
          zona: true,
          strobo: true,
          kecerahan: 0.8,
          latensi: 10
        }))
      );

      expect(mqttClient.publish).toHaveBeenCalledWith(
        'busway/portal/perintah',
        JSON.stringify({ aksi: 'buka', jenis: 'bus' }),
        { qos: 1, retain: false },
        expect.any(Function)
      );
      automation.stop();
    });
  });

  describe('payload limits and authorization', () => {
    it('returns 400 for malformed JSON without terminating the process', async () => {
      const response = await request(app)
        .post('/api/v1/mqtt/detection')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send('{"jenis":');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(publishDetection).not.toHaveBeenCalled();
    });

    it('returns 413 for an oversized JSON request body', async () => {
      const oversized = {
        ...detectionPayload('camera-large'),
        metadata: 'x'.repeat(110 * 1024)
      };

      const response = await request(app)
        .post('/api/v1/mqtt/detection')
        .set('Authorization', `Bearer ${token}`)
        .send(oversized);

      expect(response.status).toBe(413);
      expect(response.body.success).toBe(false);
      expect(publishDetection).not.toHaveBeenCalled();
    });

    it('rejects missing, malformed, and expired command tokens before database access', async () => {
      const expiredToken = jwt.sign(
        { sub: 'resilience-user', username: user.username, role: user.role },
        env.jwtSecret,
        { expiresIn: -1 }
      );

      for (const authorization of [undefined, 'Bearer not-a-jwt', `Bearer ${expiredToken}`]) {
        findById.mockClear();
        const response = await request(app)
          .post('/api/v1/mqtt/portal/command')
          .set('Content-Type', 'application/json')
          .set('Authorization', authorization ?? '')
          .send({ aksi: 'buka' });

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
        expect(publishPortalCommand).not.toHaveBeenCalled();
        expect(findById).not.toHaveBeenCalled();
      }
    });
  });

  it('handles concurrent detection payloads from multiple virtual cameras', async () => {
    const cameraRequests = Array.from({ length: 20 }, (_, cameraIndex) =>
      Array.from({ length: 5 }, (_, sequence) =>
        request(app)
          .post('/api/v1/mqtt/detection')
          .set('Authorization', `Bearer ${token}`)
          .send(detectionPayload(`camera-${cameraIndex}`, sequence))
      )
    ).flat();

    const responses = await Promise.all(cameraRequests);

    expect(responses).toHaveLength(100);
    expect(responses.every(({ status }) => status === 202)).toBe(true);
    expect(publishDetection).toHaveBeenCalledTimes(100);
  });
});
