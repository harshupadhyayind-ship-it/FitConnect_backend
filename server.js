require('dotenv').config();
const app = require('./src/app');
const { startStreakCron } = require('./src/services/streakCron');

const PORT = parseInt(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    startStreakCron();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
