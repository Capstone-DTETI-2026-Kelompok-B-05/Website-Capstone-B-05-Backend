import mqtt from 'mqtt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { jest } from '@jest/globals';

const findById = jest.fn();

jest.unstable_mockModule('../models/User.js', () => ({
  default: { findById }
}));

const { default: app } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { MQTT_TOPICS } = await import('../src/services/mqttPublisher.js');

const runIntegration = process.env.RUN_MQTT_INTEGRATION === 'true';
const hasCredentials = Boolean(env.mqttUsername && env.mqttPassword);
const describeIntegration = runIntegration && hasCredentials ? describe : describe.skip;
const testTimeout = Number(process.env.MQTT_INTEGRATION_TIMEOUT_MS ?? 30000);

const user = {
  _id: { toString: () => 'integration-user' },
  username: 'integration-operator',
  role: 'petugas'
};
const token = jwt.sign(
  { sub: 'integration-user', username: user.username, role: user.role },
  env.jwtSecret
);

function clientOptions() {
  return {
    username: env.mqttUsername,
    password: env.mqttPassword,
    clientId: `backend-integration-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: testTimeout
  };
}

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, clientOptions());
    const timeout = setTimeout(() => {
      client.end(true);
      reject(new Error(`Timed out connecting to MQTT broker ${url.replace(/\/\/.*@/, '//')}`));
    }, testTimeout);

    const onConnect = () => {
      clearTimeout(timeout);
      client.removeListener('error', onError);
      resolve(client);
    };
    const onError = (error) => {
      clearTimeout(timeout);
      client.end(true);
      reject(error);
    };

    client.once('connect', onConnect);
    client.once('error', onError);
  });
}

function subscribe(client, topic) {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, { qos: 1 }, (error) => (error ? reject(error) : resolve()));
  });
}

function publish(client, topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function nextMessage(client, expectedTopic) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.removeListener('message', onMessage);
      reject(new Error(`Timed out waiting for MQTT message on ${expectedTopic}`));
    }, testTimeout);
    const onMessage = (topic, message) => {
      if (topic !== expectedTopic) return;
      clearTimeout(timeout);
      client.removeListener('message', onMessage);
      try {
        resolve(JSON.parse(message.toString()));
      } catch (error) {
        reject(error);
      }
    };
    client.on('message', onMessage);
  });
}

function transportUrls() {
  return [
    env.mqttBrokerUrl,
    process.env.MQTT_WSS_URL
  ].filter(Boolean);
}

describeIntegration('EMQX API integration', () => {
  let subscriber;

  beforeEach(() => {
    findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
  });

  afterEach(async () => {
    if (subscriber) {
      await new Promise((resolve) => subscriber.end(true, resolve));
      subscriber = undefined;
    }
  });

  it('serves stateless REST responses without starting a server listener', async () => {
    const first = await request(app).get('/api/v1/health');
    const second = await request(app).get('/api/v1/health');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(second.body.success).toBe(true);
    expect(first.headers['x-powered-by']).toBeUndefined();
  }, testTimeout);

  it.each(transportUrls())(
    'completes MQTT handshake, subscription, and publish loop over %s',
    async (url) => {
      const topic = `busway/integration/handshake/${Date.now()}`;
      const client = await connectClient(url);
      try {
        await subscribe(client, topic);
        const expected = { test: 'handshake', topic };
        const message = nextMessage(client, topic);
        await publish(client, topic, expected);
        await expect(message).resolves.toEqual(expected);
      } finally {
        client.end(true);
      }
    },
    testTimeout
  );

  it('delivers a dashboard portal command from REST through EMQX to a target client', async () => {
    subscriber = await connectClient(env.mqttBrokerUrl);
    await subscribe(subscriber, MQTT_TOPICS.portalCommand);
    const message = nextMessage(subscriber, MQTT_TOPICS.portalCommand);

    const response = await request(app)
      .post('/api/v1/mqtt/portal/command')
      .set('Authorization', `Bearer ${token}`)
      .send({ aksi: 'buka' });

    expect(response.status).toBe(202);
    await expect(message).resolves.toEqual({ aksi: 'buka' });
  }, testTimeout);

  it('delivers manual-mode commands with their payload intact', async () => {
    subscriber = await connectClient(env.mqttBrokerUrl);
    await subscribe(subscriber, MQTT_TOPICS.portalCommand);
    const message = nextMessage(subscriber, MQTT_TOPICS.portalCommand);

    const response = await request(app)
      .post('/api/v1/mqtt/portal/command')
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'manual' });

    expect(response.status).toBe(202);
    await expect(message).resolves.toEqual({ mode: 'manual' });
  }, testTimeout);
});
