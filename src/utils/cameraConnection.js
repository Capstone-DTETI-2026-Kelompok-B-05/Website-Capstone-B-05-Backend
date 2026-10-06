import net from 'node:net';
import tls from 'node:tls';

const DEFAULT_TIMEOUT_MS = 5000;

function getCameraEndpoint(rtspUrl) {
  const url = new URL(rtspUrl);
  if (!['rtsp:', 'rtsps:'].includes(url.protocol)) {
    throw new Error('Camera URL must use the rtsp or rtsps protocol');
  }

  return {
    host: url.hostname,
    port: Number(url.port) || (url.protocol === 'rtsps:' ? 322 : 554),
    secure: url.protocol === 'rtsps:'
  };
}

export function checkCameraConnection(rtspUrl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const endpoint = getCameraEndpoint(rtspUrl);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket = endpoint.secure
      ? tls.connect({ host: endpoint.host, port: endpoint.port, rejectUnauthorized: false })
      : net.createConnection({ host: endpoint.host, port: endpoint.port });

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ connected: true }));
    socket.once('secureConnect', () => finish({ connected: true }));
    socket.once('timeout', () => finish({ connected: false, reason: 'Connection timed out' }));
    socket.once('error', (error) => finish({ connected: false, reason: error.message }));
  });
}
