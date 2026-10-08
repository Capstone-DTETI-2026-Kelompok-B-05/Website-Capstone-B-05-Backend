import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';

const mqttClient = new EventEmitter();
mqttClient.publish = jest.fn((topic, message, options, callback) => callback());
mqttClient.end = jest.fn();
const connect = jest.fn(() => {
  process.nextTick(() => mqttClient.emit('connect'));
  return mqttClient;
});

jest.unstable_mockModule('mqtt', () => ({ default: { connect } }));

const {
  MQTT_TOPICS,
  publishDetection,
  publishPortalCommand,
  publishPortalStatus,
  validateDetectionPayload
} = await import('../src/services/mqttPublisher.js');

const detectionPayload = (jenis) => ({
  jenis,
  id: 'vehicle-1',
  conf: 0.95,
  zona: true,
  strobo: false,
  kecerahan: 0.7,
  latensi: 35
});

describe('MQTT publisher payload contracts', () => {
  beforeEach(() => {
    connect.mockClear();
    mqttClient.publish.mockClear();
    mqttClient.end.mockClear();
  });

  it.each(['bus', 'ambulans', 'damkar', 'mobil', 'motor', 'truk'])(
    'accepts the %s vehicle detection payload',
    (jenis) => {
      expect(validateDetectionPayload(detectionPayload(jenis))).toEqual(detectionPayload(jenis));
    }
  );

  it.each([
    ['conf', 1.01],
    ['kecerahan', -0.01]
  ])('rejects %s outside the unit interval', (field, value) => {
    expect(() => validateDetectionPayload({ ...detectionPayload('bus'), [field]: value }))
      .toThrow(`must be a number between 0 and 1`);
  });

  it('rejects malformed zone and confidence values', () => {
    expect(() => validateDetectionPayload({ ...detectionPayload('bus'), zona: 'true' }))
      .toThrow('zona must be a boolean');
    expect(() => validateDetectionPayload({ ...detectionPayload('bus'), conf: '0.9' }))
      .toThrow('conf must be a number between 0 and 1');
  });

  it('publishes detection data unchanged to busway/deteksi', async () => {
    const payload = detectionPayload('bus');

    await publishDetection(payload);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(mqttClient.publish).toHaveBeenCalledWith(
      MQTT_TOPICS.detection,
      JSON.stringify(payload),
      { qos: 0, retain: false },
      expect.any(Function)
    );
    expect(mqttClient.end).toHaveBeenCalledWith(true);
  });

  it('publishes retained portal status messages', async () => {
    const payload = { terbuka: true, sumber: 'otomatis' };

    await publishPortalStatus(payload);

    expect(mqttClient.publish).toHaveBeenCalledWith(
      MQTT_TOPICS.portalStatus,
      JSON.stringify(payload),
      { qos: 1, retain: true },
      expect.any(Function)
    );
  });

  it('removes vehicle metadata from portal commands', async () => {
    await publishPortalCommand({ aksi: 'buka', jenis: 'ambulans' });

    expect(mqttClient.publish).toHaveBeenCalledWith(
      MQTT_TOPICS.portalCommand,
      JSON.stringify({ aksi: 'buka' }),
      { qos: 1, retain: false },
      expect.any(Function)
    );
  });

  it.each(['mobil', 'motor', 'truk'])('rejects %s as an opening trigger', (jenis) => {
    expect(() => publishPortalCommand({ aksi: 'buka', jenis })).toThrow(
      'Only bus, ambulans, and damkar can trigger portal opening'
    );
  });
});
