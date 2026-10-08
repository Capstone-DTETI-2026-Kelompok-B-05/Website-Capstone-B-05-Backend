function resetPortalState(context, events, done) {
  context.mqtt.publish(
    'busway/portal/status',
    JSON.stringify({ terbuka: false, sumber: 'otomatis' }),
    { qos: 1, retain: true },
    done
  );
}

function startPortalCommandLatency(context, events, done) {
  const startedAt = process.hrtime.bigint();
  const timeoutMs = Number(process.env.LOAD_TEST_LATENCY_TIMEOUT_MS ?? 10000);
  const timeout = setTimeout(() => {
    done(new Error('Timed out waiting for busway/portal/perintah'));
  }, timeoutMs);

  context.vars.portalCommandPromise = new Promise((resolve, reject) => {
    const onMessage = (topic, message) => {
      if (topic !== 'busway/portal/perintah') return;
      clearTimeout(timeout);
      context.mqtt.removeListener('message', onMessage);
      try {
        const payload = JSON.parse(message.toString());
        if (payload.aksi !== 'buka') {
          reject(new Error(`Expected portal opening command, received ${message.toString()}`));
          return;
        }
        const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        context.vars.portalCommandLatencyMs = latencyMs;
        events.emit('histogram', 'mqtt.priority_detection_to_portal_command_ms', latencyMs);
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    };

    context.mqtt.on('message', onMessage);
    context.mqtt.subscribe('busway/portal/perintah', { qos: 1 }, (error) => {
      if (error) {
        clearTimeout(timeout);
        context.mqtt.removeListener('message', onMessage);
        reject(error);
      }
    });
  });

  return done();
}

function waitForPortalCommand(context, events, done) {
  context.vars.portalCommandPromise
    .then(() => {
      const thresholdMs = Number(process.env.LOAD_TEST_LATENCY_THRESHOLD_MS ?? 500);
      if (context.vars.portalCommandLatencyMs > thresholdMs) {
        done(new Error(
          `Priority detection to portal command latency ${context.vars.portalCommandLatencyMs.toFixed(2)}ms exceeded ${thresholdMs}ms`
        ));
        return;
      }
      done();
    })
    .catch((error) => done(error));
}

module.exports = {
  resetPortalState,
  startPortalCommandLatency,
  waitForPortalCommand
};
