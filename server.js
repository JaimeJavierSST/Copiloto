require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const { sendPush, PUBLIC_KEY } = require('./push');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HOUR_MS = 3600 * 1000;
const ALERT_THRESHOLD_MS = 4.5 * HOUR_MS;   // aviso 30 min antes del máximo
const MAX_THRESHOLD_MS = 5 * HOUR_MS;       // máximo legal
const REST_RATIO = 0.4;                     // 5h conducción -> 2h descanso (40%)
const MIN_REST_BETWEEN_MS = 8 * HOUR_MS;    // mínimo esperado de descanso entre jornadas
const TICK_SECRET = process.env.TICK_SECRET || null; // opcional, protege el endpoint de tick

// ---------- Helpers ----------
function cleanRut(rut) {
  return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}
function validRut(rut) {
  const clean = cleanRut(rut);
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  const expected = res === 11 ? '0' : res === 10 ? 'K' : String(res);
  return expected === dv;
}

async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return 'Ubicación no disponible';
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
      headers: { 'User-Agent': 'FiscalizadorArt25bis/1.0 (Y&S Gestion en Prevencion de Riesgos)' }
    });
    const data = await r.json();
    return data && data.display_name ? data.display_name : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch (e) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

function currentDrivingMs(trip) {
  const extra = (trip.status === 'driving' && trip.segment_start) ? (Date.now() - trip.segment_start) : 0;
  return trip.accumulated_ms + extra;
}

function fmtHM(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
function fmtClock(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// ---------- Driver registration + push subscription ----------
app.post('/api/driver/register', async (req, res) => {
  const { rut, subscription } = req.body;
  if (!rut || !validRut(rut)) return res.status(400).json({ error: 'RUT inválido' });
  const clean = cleanRut(rut);
  const existing = await db.get('SELECT rut FROM drivers WHERE rut = ?', [clean]);
  if (existing) {
    await db.run('UPDATE drivers SET subscription = ? WHERE rut = ?', [JSON.stringify(subscription || null), clean]);
  } else {
    await db.run('INSERT INTO drivers (rut, subscription, created_at) VALUES (?, ?, ?)',
      [clean, JSON.stringify(subscription || null), Date.now()]);
  }
  res.json({ ok: true, rut: clean });
});

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: PUBLIC_KEY });
});

// ---------- Trip lifecycle ----------
app.get('/api/trip/active/:rut', async (req, res) => {
  const rut = cleanRut(req.params.rut);
  const trip = await db.get(`SELECT * FROM trips WHERE rut = ? AND status != 'ended' ORDER BY id DESC LIMIT 1`, [rut]);
  const lastEnded = await db.get(`SELECT * FROM trips WHERE rut = ? AND status = 'ended' ORDER BY id DESC LIMIT 1`, [rut]);
  res.json({ trip: trip || null, lastEnded: lastEnded || null });
});

app.get('/api/trip/history/:rut', async (req, res) => {
  const rut = cleanRut(req.params.rut);
  const trips = await db.all(`SELECT * FROM trips WHERE rut = ? AND status = 'ended' ORDER BY id DESC LIMIT 30`, [rut]);
  res.json({ trips });
});

app.post('/api/trip/start', async (req, res) => {
  const rut = cleanRut(req.body.rut);
  const { lat, lng } = req.body;
  const driver = await db.get('SELECT * FROM drivers WHERE rut = ?', [rut]);
  if (!driver) return res.status(400).json({ error: 'Conductor no registrado' });

  const existing = await db.get(`SELECT id FROM trips WHERE rut = ? AND status != 'ended'`, [rut]);
  if (existing) return res.status(409).json({ error: 'Ya existe un viaje en curso' });

  const address = await reverseGeocode(lat, lng);
  const now = Date.now();

  // Si el último cierre fue "fin de jornada", calculamos cuánto tiempo pasó
  // desde entonces hasta este nuevo inicio de viaje (descanso entre jornadas).
  const lastEnded = await db.get(`SELECT * FROM trips WHERE rut = ? AND status = 'ended' ORDER BY end_time DESC LIMIT 1`, [rut]);
  let restBeforeMs = null, restBeforeSince = null, restBeforeInsufficient = 0;
  if (lastEnded && lastEnded.end_type === 'jornada' && lastEnded.end_time) {
    restBeforeMs = now - lastEnded.end_time;
    restBeforeSince = lastEnded.end_time;
    restBeforeInsufficient = restBeforeMs < MIN_REST_BETWEEN_MS ? 1 : 0;
  }

  const info = await db.run(`
    INSERT INTO trips (rut, status, start_time, accumulated_ms, segment_start, start_lat, start_lng, start_address, rest_before_ms, rest_before_since, rest_before_insufficient)
    VALUES (?, 'driving', ?, 0, ?, ?, ?, ?, ?, ?, ?)
  `, [rut, now, now, lat ?? null, lng ?? null, address, restBeforeMs, restBeforeSince, restBeforeInsufficient]);

  res.json({
    tripId: info.lastInsertRowid,
    startAddress: address,
    restBeforeMs, restBeforeSince,
    restBeforeLabel: restBeforeMs != null ? fmtHM(restBeforeMs) : null,
    restBeforeSinceLabel: restBeforeSince != null ? fmtClock(restBeforeSince) : null,
    restBeforeInsufficient: !!restBeforeInsufficient
  });
});

app.post('/api/trip/pause', async (req, res) => {
  const rut = cleanRut(req.body.rut);
  const trip = await db.get(`SELECT * FROM trips WHERE rut = ? AND status = 'driving'`, [rut]);
  if (!trip) return res.status(404).json({ error: 'No hay viaje en conducción' });
  const accumulated = trip.accumulated_ms + (Date.now() - trip.segment_start);
  await db.run(`UPDATE trips SET status='paused', accumulated_ms=?, segment_start=NULL WHERE id=?`, [accumulated, trip.id]);
  res.json({ ok: true, accumulatedMs: accumulated });
});

app.post('/api/trip/resume', async (req, res) => {
  const rut = cleanRut(req.body.rut);
  const trip = await db.get(`SELECT * FROM trips WHERE rut = ? AND status = 'paused'`, [rut]);
  if (!trip) return res.status(404).json({ error: 'No hay viaje pausado' });
  await db.run(`UPDATE trips SET status='driving', segment_start=? WHERE id=?`, [Date.now(), trip.id]);
  res.json({ ok: true });
});

app.post('/api/trip/end', async (req, res) => {
  const rut = cleanRut(req.body.rut);
  const { lat, lng } = req.body;
  const endType = req.body.endType === 'jornada' ? 'jornada' : 'viaje';
  const trip = await db.get(`SELECT * FROM trips WHERE rut = ? AND status != 'ended' ORDER BY id DESC LIMIT 1`, [rut]);
  if (!trip) return res.status(404).json({ error: 'No hay viaje activo' });

  // Al finalizar se asume que el conductor comienza su descanso de inmediato;
  // no requiere ninguna confirmación manual.
  const drivingMs = currentDrivingMs(trip);
  const restMs = drivingMs * REST_RATIO;
  const restEndsAt = Date.now() + restMs;
  const address = await reverseGeocode(lat, lng);

  await db.run(`
    UPDATE trips SET status='ended', end_time=?, driving_ms=?, rest_ms=?, rest_ends_at=?,
      end_lat=?, end_lng=?, end_address=?, rest_notified=0, end_type=?
    WHERE id=?
  `, [Date.now(), drivingMs, restMs, restEndsAt, lat ?? null, lng ?? null, address, endType, trip.id]);

  res.json({
    drivingMs, restMs, restEndsAt,
    restEndsAtLabel: fmtClock(restEndsAt),
    restLabel: fmtHM(restMs),
    over: drivingMs > MAX_THRESHOLD_MS,
    endAddress: address,
    endType
  });
});

// ---------- Tick: called every 1-2 min by an external cron pinger ----------
// Checks every active/pending trip and sends any due push notifications.
app.get('/api/tick', async (req, res) => {
  if (TICK_SECRET && req.query.secret !== TICK_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const results = [];

  // --- Active driving trips: hourly / 4:30 alert / 5h max ---
  const driving = await db.all(`SELECT * FROM trips WHERE status = 'driving'`);
  for (const trip of driving) {
    const driver = await db.get('SELECT * FROM drivers WHERE rut = ?', [trip.rut]);
    if (!driver || !driver.subscription || driver.subscription === 'null') continue;
    const ms = currentDrivingMs(trip);
    const wholeHours = Math.floor(ms / HOUR_MS);

    if (wholeHours > trip.notified_hours && wholeHours >= 1) {
      await sendPush(driver.subscription, {
        title: '🚗 Un mensaje de tu copiloto',
        body: `Llevas ${wholeHours} hora${wholeHours > 1 ? 's' : ''} manejando.`
      });
      await db.run('UPDATE trips SET notified_hours=? WHERE id=?', [wholeHours, trip.id]);
      results.push(`hora ${wholeHours} -> ${trip.rut}`);
    }
    if (!trip.alert_fired && ms >= ALERT_THRESHOLD_MS) {
      await sendPush(driver.subscription, {
        title: '☕ Se acerca tu descanso',
        body: 'En 30 minutos cumplirás 5 horas de conducción 🙂',
        urgent: true
      });
      await db.run('UPDATE trips SET alert_fired=1 WHERE id=?', [trip.id]);
      results.push(`alerta4:30 -> ${trip.rut}`);
    }
    if (!trip.max_fired && ms >= MAX_THRESHOLD_MS) {
      await sendPush(driver.subscription, {
        title: '🛑 Hora de parar',
        body: 'Ya llevas 5 horas manejando. Por tu seguridad, es momento de detenerte a descansar.',
        urgent: true
      });
      await db.run('UPDATE trips SET max_fired=1 WHERE id=?', [trip.id]);
      results.push(`max5h -> ${trip.rut}`);
    }
  }

  // --- Ended trips waiting for rest to complete ---
  // Solo se avisa cuando fue "Finalizar viaje" (el conductor seguirá su jornada).
  // "Finalizar jornada" nunca dispara este aviso: el conductor ya terminó de trabajar
  // y no debe recibir una notificación mientras duerme.
  const pendingRest = await db.all(`
    SELECT * FROM trips WHERE status = 'ended' AND rest_notified = 0
      AND end_type = 'viaje' AND rest_ends_at <= ?
  `, [Date.now()]);
  for (const trip of pendingRest) {
    const driver = await db.get('SELECT * FROM drivers WHERE rut = ?', [trip.rut]);
    if (!driver || !driver.subscription || driver.subscription === 'null') continue;
    await sendPush(driver.subscription, {
      title: '✅ ¡Ya descansaste!',
      body: '¡Buen descanso! Ya puedes retomar tu viaje cuando gustes 🚗',
      urgent: true
    });
    await db.run('UPDATE trips SET rest_notified=1 WHERE id=?', [trip.id]);
    results.push(`descanso-cumplido -> ${trip.rut}`);
  }

  res.json({ ok: true, checked: driving.length + pendingRest.length, sent: results });
});

app.get('/health', (req, res) => res.json({ ok: true, time: Date.now() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Fiscalizador Art. 25 bis escuchando en puerto ${PORT}`));
