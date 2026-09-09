const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS drivers (
  rut TEXT PRIMARY KEY,
  subscription TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rut TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'driving', -- driving | paused | ended
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
  end_type TEXT DEFAULT 'viaje', -- 'viaje' (avisa cuando termina el descanso) | 'jornada' (no avisa)
  rest_before_ms INTEGER,        -- descanso transcurrido desde el fin de la última jornada
  rest_before_since INTEGER,     -- hora en que terminó esa última jornada
  rest_before_insufficient INTEGER DEFAULT 0 -- 1 si ese descanso fue menor a 8 horas
);
`);

module.exports = db;
