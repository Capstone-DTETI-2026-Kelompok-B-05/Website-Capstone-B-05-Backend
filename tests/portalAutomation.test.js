import { jest } from '@jest/globals';
import { parseMqttPayload, PortalAutomationController } from '../src/services/portalAutomation.js';

const detection = (jenis, zona = true) => ({
  jenis,
  id: 1,
  conf: 0.9,
  zona,
  strobo: true,
  kecerahan: 0.8,
  latensi: 20
});

describe('PortalAutomationController', () => {
  it('parses valid JSON and loose object-style MQTT payloads', () => {
    expect(parseMqttPayload('{"mode":"manual"}')).toEqual({ mode: 'manual' });
    expect(parseMqttPayload('{mode:otomatis}')).toEqual({ mode: 'otomatis' });
    expect(parseMqttPayload('{aksi:buka,jenis:bus,conf:0.65,zona:true}')).toEqual({
      aksi: 'buka',
      jenis: 'bus',
      conf: 0.65,
      zona: true
    });
    expect(parseMqttPayload('{id:camera-01,timestamp:2026-10-16T07:08:51.329Z}')).toEqual({
      id: 'camera-01',
      timestamp: '2026-10-16T07:08:51.329Z'
    });
  });

  it('rejects payloads that are neither JSON nor supported loose objects', () => {
    expect(() => parseMqttPayload('{mode:}')).toThrow('Invalid MQTT payload');
  });

  it.each(['bus', 'ambulans', 'damkar'])(
    'opens the portal for authorized %s detections in the zone',
    (jenis) => {
      const publishCommand = jest.fn();
      const controller = new PortalAutomationController({ publishCommand });

      controller.handleDetection(detection(jenis));

      expect(publishCommand).toHaveBeenCalledWith({ aksi: 'buka' });
      expect(controller.portalOpen).toBe(false);
    }
  );

  it.each(['mobil', 'motor', 'truk'])(
    'keeps the portal closed for unauthorized %s detections',
    (jenis) => {
      const publishCommand = jest.fn();
      const controller = new PortalAutomationController({ publishCommand });

      controller.handleDetection(detection(jenis));

      expect(publishCommand).not.toHaveBeenCalled();
      expect(controller.portalOpen).toBe(false);
    }
  );

  it('does not open for an authorized vehicle outside the zone', () => {
    const publishCommand = jest.fn();
    const controller = new PortalAutomationController({ publishCommand });

    controller.handleDetection(detection('bus', false));

    expect(publishCommand).not.toHaveBeenCalled();
    expect(controller.portalOpen).toBe(false);
  });

  it('closes an open portal after an out-of-zone detection', () => {
    const publishCommand = jest.fn();
    const setTimeoutFn = jest.fn((callback) => {
      callback();
      return 1;
    });
    const controller = new PortalAutomationController({
      publishCommand,
      setTimeoutFn,
      closeDelayMs: 2000
    });
    controller.handleStatus({ terbuka: true });

    controller.handleDetection(detection('mobil', false));

    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 2000);
    expect(publishCommand).toHaveBeenCalledWith({ aksi: 'tutup' });
    expect(controller.portalOpen).toBe(true);
  });

  it('does not automate while in manual mode', () => {
    const publishCommand = jest.fn();
    const controller = new PortalAutomationController({ publishCommand });

    controller.handleCommand({ mode: 'manual' });
    controller.handleDetection(detection('bus'));

    expect(publishCommand).not.toHaveBeenCalled();
    expect(controller.operationMode).toBe('manual');
  });

  it('returns to automatic mode after a manual portal action', () => {
    const publishCommand = jest.fn();
    const controller = new PortalAutomationController({ publishCommand });

    controller.handleCommand({ mode: 'manual' });
    controller.handleCommand({ aksi: 'buka' });
    controller.handleDetection(detection('bus'));

    expect(controller.operationMode).toBe('otomatis');
    expect(publishCommand).toHaveBeenCalledWith({ aksi: 'buka' });
  });

  it('retries opening when no portal status confirms the previous command', () => {
    const publishCommand = jest.fn();
    const controller = new PortalAutomationController({ publishCommand });

    controller.handleDetection(detection('bus'));
    controller.handleDetection(detection('bus'));

    expect(publishCommand).toHaveBeenCalledTimes(2);
    expect(controller.portalOpen).toBe(false);
  });

  it('refreshes the two-second close timer while a priority vehicle is detected', () => {
    const publishCommand = jest.fn();
    const setTimeoutFn = jest.fn(() => 1);
    const clearTimeoutFn = jest.fn();
    const controller = new PortalAutomationController({
      publishCommand,
      setTimeoutFn,
      clearTimeoutFn
    });

    controller.handleStatus({ terbuka: true });
    controller.handleDetection(detection('bus'));
    controller.handleDetection(detection('bus'));

    expect(clearTimeoutFn).toHaveBeenCalledWith(1);
    expect(setTimeoutFn).toHaveBeenCalledTimes(2);
    expect(setTimeoutFn).toHaveBeenLastCalledWith(expect.any(Function), 2000);
    expect(publishCommand).not.toHaveBeenCalled();
  });

  it('closes two seconds after the last priority detection', () => {
    const publishCommand = jest.fn();
    let closeCallback;
    const controller = new PortalAutomationController({
      publishCommand,
      setTimeoutFn: (callback, delay) => {
        expect(delay).toBe(2000);
        closeCallback = callback;
        return 1;
      }
    });

    controller.handleStatus({ terbuka: true });
    controller.handleDetection(detection('bus'));
    closeCallback();

    expect(publishCommand).toHaveBeenCalledWith({ aksi: 'tutup' });
  });

  it('keeps the portal close timer alive while an in-zone vehicle heartbeat arrives', () => {
    const publishCommand = jest.fn();
    const callbacks = [];
    const clearTimeoutFn = jest.fn();
    const controller = new PortalAutomationController({
      publishCommand,
      setTimeoutFn: callback => {
        callbacks.push(callback);
        return callbacks.length;
      },
      clearTimeoutFn
    });

    controller.handleStatus({ terbuka: true });
    controller.handleDetection(detection('bus'));
    controller.handleDetection({ ...detection('bus'), id: 'camera-01-track-1', isNewZoneEntry: false });

    expect(clearTimeoutFn).toHaveBeenCalledWith(1);
    expect(callbacks).toHaveLength(2);
    expect(publishCommand).not.toHaveBeenCalled();
  });
});
