const webpush = require('web-push');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!PUBLIC_KEY || !PRIVATE_KEY) {
  console.warn('[push] Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en variables de entorno.');
}

webpush.setVapidDetails(
  'mailto:contacto@ysgestion.cl',
  PUBLIC_KEY,
  PRIVATE_KEY
);

async function sendPush(subscriptionJson, payload) {
  try {
    const subscription = JSON.parse(subscriptionJson);
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error('[push] Error enviando notificación:', err.statusCode || err.message);
    return false;
  }
}

module.exports = { sendPush, PUBLIC_KEY };
