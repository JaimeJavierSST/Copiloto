const { createClient } = require('@libsql/client');

// Si defines TURSO_DATABASE_URL (y TURSO_AUTH_TOKEN), la app usa tu base de
// datos en Turso — persiste siempre, incluso si Render "duerme" o reinicia.
// Si NO las defines (por ejemplo, en tu computador para probar), usa un
// archivo local (local.db) — útil solo para desarrollo, se pierde igual que
// antes si el disco se reinicia.
const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

if (!process.env.TURSO_DATABASE_URL) {
  console.warn('[db] TURSO_DATABASE_URL no está definida — usando archivo local (no persiste en hosting free).');
}

const client = createClient({ url, authToken });

async function init() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS drivers (
      rut TEXT PRIMARY KEY,
      subscription TEXT,
      created_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rut TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'driving',
      start_time INTEGER,
      accumulated_ms INTEGER DEFAULT 0,
      segment_start INTEGER,
      notified_hours INTEGER DEFAULT 0,
      alert_fired INTEGER DEFAULT 0,
      max_fired INTEGER DEFAULT 0,
      start_lat REAL, start_lng REAL, start_address TEXT,
      end_lat REAL, end_lng REAL, end_address TEXT,
      end_time INTEGER,
      driving_ms INTEGER,
      rest_ms INTEGER,
      rest_ends_at INTEGER,
      rest_notified INTEGER DEFAULT 0,
      end_type TEXT DEFAULT 'viaje',
      rest_before_ms INTEGER,
      rest_before_since INTEGER,
      rest_before_insufficient INTEGER DEFAULT 0
    )`
  ];
  for (const sql of statements) {
    await client.execute(sql);
  }
}
const ready = init();

// ---- Helpers con forma parecida a better-sqlite3, pero async ----
async function get(sql, args = []) {
  await ready;
  const rs = await client.execute({ sql, args });
  return rs.rows[0] || null;
}
async function all(sql, args = []) {
  await ready;
  const rs = await client.execute({ sql, args });
  return rs.rows;
}
async function run(sql, args = []) {
  await ready;
  const rs = await client.execute({ sql, args });
  return {
    lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : null,
    changes: rs.rowsAffected
  };
}

module.exports = { get, all, run };
