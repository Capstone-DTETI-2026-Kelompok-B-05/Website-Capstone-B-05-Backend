import { jest } from '@jest/globals';
import { PortalAutomationController } from '../src/services/portalAutomation.js';

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
  it.each(['bus', 'ambulans', 'damkar'])(
    'opens the portal for authorized %s detections in the zone',
    (jenis) => {
      const publishCommand = jest.fn();
      const controller = new PortalAutomationController({ publishCommand });

      controller.handleDetection(detection(jenis));

      expect(publishCommand).toHaveBeenCalledWith({ aksi: 'buka', jenis });
      expect(controller.portalOpen).toBe(true);
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
      closeDelayMs: 1500
    });
    controller.handleStatus({ terbuka: true });

    controller.handleDetection(detection('mobil', false));

    expect(setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1500);
    expect(publishCommand).toHaveBeenCalledWith({ aksi: 'tutup' });
    expect(controller.portalOpen).toBe(false);
  });

  it('does not automate while in manual mode', () => {
    const publishCommand = jest.fn();
    const controller = new PortalAutomationController({ publishCommand });

    controller.handleCommand({ mode: 'manual' });
    controller.handleDetection(detection('bus'));

    expect(publishCommand).not.toHaveBeenCalled();
    expect(controller.operationMode).toBe('manual');
  });
});
