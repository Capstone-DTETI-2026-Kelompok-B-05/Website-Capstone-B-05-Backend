import jwt from 'jsonwebtoken';
import request from 'supertest';
import { jest } from '@jest/globals';

const findById = jest.fn();
const publishDetection = jest.fn().mockResolvedValue(undefined);
const publishPortalStatus = jest.fn().mockResolvedValue(undefined);
const publishPortalCommand = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../models/User.js', () => ({
  default: { findById }
}));
jest.unstable_mockModule('../src/services/mqttPublisher.js', () => ({
  publishDetection,
  publishPortalStatus,
  publishPortalCommand
}));

const [{ default: app }, { env }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/env.js')
]);

const token = jwt.sign(
  { sub: 'user-1', username: 'operator', role: 'petugas' },
  env.jwtSecret
);
const user = { _id: { toString: () => 'user-1' }, username: 'operator', role: 'petugas' };

const validDetection = {
  jenis: 'bus',
  id: 'bus-1',
  conf: 0.98,
  zona: true,
  strobo: false,
  kecerahan: 0.6,
  latensi: 18
};

describe('MQTT HTTP routes', () => {
  beforeEach(() => {
    findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    publishDetection.mockClear();
    publishPortalStatus.mockClear();
    publishPortalCommand.mockClear();
  });

  it('publishes a detection payload for an authenticated user', async () => {
    const response = await request(app)
      .post('/api/v1/mqtt/detection')
      .set('Authorization', `Bearer ${token}`)
      .send(validDetection);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ success: true, message: 'Message published' });
    expect(publishDetection).toHaveBeenCalledWith(validDetection);
  });

  it('publishes portal status and command payloads', async () => {
    const statusResponse = await request(app)
      .post('/api/v1/mqtt/portal/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ terbuka: false, sumber: 'manual' });
    const commandResponse = await request(app)
      .post('/api/v1/mqtt/portal/command')
      .set('Authorization', `Bearer ${token}`)
      .send({ aksi: 'tutup' });

    expect(statusResponse.status).toBe(202);
    expect(commandResponse.status).toBe(202);
    expect(publishPortalStatus).toHaveBeenCalledWith({ terbuka: false, sumber: 'manual' });
    expect(publishPortalCommand).toHaveBeenCalledWith({ aksi: 'tutup' });
  });

  it('returns 400 for an invalid detection payload', async () => {
    publishDetection.mockRejectedValueOnce(new Error('conf must be a number between 0 and 1'));

    const response = await request(app)
      .post('/api/v1/mqtt/detection')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validDetection, conf: 2 });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/conf must be/);
  });

  it('does not reach the publisher without a valid authentication token', async () => {
    const response = await request(app)
      .post('/api/v1/mqtt/detection')
      .send(validDetection);

    expect(response.status).toBe(401);
    expect(publishDetection).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
  });
});
