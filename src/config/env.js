import 'dotenv/config';

const requiredEnvironment = ['PORT', 'MONGO_URI', 'MQTT_BROKER_URL', 'CLIENT_ORIGIN'];

for (const key of requiredEnvironment) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT),
  mongoUri: process.env.MONGO_URI,
  mqttBrokerUrl: process.env.MQTT_BROKER_URL,
  mqttUsername: process.env.MQTT_USERNAME,
  mqttPassword: process.env.MQTT_PASSWORD,
  clientOrigin: process.env.CLIENT_ORIGIN,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret:
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === 'production'
      ? (() => {
          throw new Error('Missing required environment variable: JWT_SECRET');
        })()
      : 'development-only-change-this-jwt-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d'
};
