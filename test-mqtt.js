import 'dotenv/config';
import mqtt from 'mqtt';

const requiredEnvironment = ['MQTT_BROKER_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);

if (missingEnvironment.length > 0) {
  console.error(`Missing required MQTT environment variable(s): ${missingEnvironment.join(', ')}`);
  process.exitCode = 1;
} else {
  const testId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const topic = `busway/test/connection/${testId}`;
  const payload = JSON.stringify({
    test: 'mqtt-connection',
    id: testId,
    sentAt: new Date().toISOString()
  });

  const client = mqtt.connect(process.env.MQTT_BROKER_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: `backend-mqtt-test-${testId}`,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 10000
  });

  let finished = false;
  const timeout = setTimeout(() => {
    finish(new Error('Timed out waiting for the MQTT round-trip message'));
  }, 15000);

  function finish(error) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    client.end(true, () => {
      if (error) {
        console.error(`MQTT test failed: ${error.message}`);
        process.exitCode = 1;
      } else {
        console.log('MQTT connection and publish/subscribe round trip succeeded.');
      }
    });
  }

  client.once('error', finish);

  client.on('connect', () => {
    console.log(`Connected to MQTT broker: ${process.env.MQTT_BROKER_URL}`);
    client.subscribe(topic, { qos: 1 }, (error) => {
      if (error) {
        finish(error);
        return;
      }

      client.publish(topic, payload, { qos: 1, retain: false }, (publishError) => {
        if (publishError) finish(publishError);
      });
    });
  });

  client.on('message', (receivedTopic, message) => {
    if (receivedTopic !== topic || message.toString() !== payload) return;
    finish();
  });
}
