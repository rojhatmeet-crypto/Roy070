// Databaselaag: SQLite via de ingebouwde node:sqlite (Node 22.13+).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SETTINGS = {
  bedrijf_naam: 'RKS Infra',
  bedrijf_adres: '',
  bedrijf_postcode: '',
  bedrijf_plaats: '',
  bedrijf_kvk: '',
  bedrijf_btw_id: '',
  bedrijf_iban: '',
  bedrijf_email: '',
  bedrijf_telefoon: '',
  factuur_prefix: 'RKS',
  factuur_volgnummer: '0',
  factuur_jaar: '',
};

export function openDb(path = process.env.DB_PATH || join(here, '..', 'data', 'rks.db')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insert.run(k, v);
  return wrap(db);
}

// Kleine, voorspelbare API bovenop DatabaseSync.
function wrap(raw) {
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };
  const plain = (row) => (row ? { ...row } : undefined);
  let depth = 0;

  const db = {
    raw,
    get: (sql, ...p) => plain(stmt(sql).get(...p)),
    all: (sql, ...p) => stmt(sql).all(...p).map((r) => ({ ...r })),
    run: (sql, ...p) => {
      const r = stmt(sql).run(...p);
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    exec: (sql) => raw.exec(sql),
    // Transactie; geneste aanroepen lopen mee in de buitenste.
    tx(fn) {
      if (depth > 0) return fn();
      raw.exec('BEGIN IMMEDIATE');
      depth++;
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },
    setting: (key) => db.get('SELECT value FROM settings WHERE key = ?', key)?.value ?? '',
    settings() {
      const out = { ...DEFAULT_SETTINGS };
      for (const r of db.all('SELECT key, value FROM settings')) out[r.key] = r.value;
      return out;
    },
    setSetting: (key, value) => db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key, String(value)),
    audit: (wie, actie, entiteit, entiteitId = null, details = '') => db.run(
      'INSERT INTO audit_log (wie, actie, entiteit, entiteit_id, details) VALUES (?, ?, ?, ?, ?)',
      wie, actie, entiteit, entiteitId, details),
  };
  return db;
}
