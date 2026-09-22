-- RKS Infra platform, databaseschema (SQLite)
-- Bedragen in centen (INTEGER), uren in minuten (INTEGER), datums als 'YYYY-MM-DD'.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS klanten (
  id                  INTEGER PRIMARY KEY,
  naam                TEXT NOT NULL,
  contactpersoon      TEXT NOT NULL DEFAULT '',
  email               TEXT NOT NULL DEFAULT '',
  telefoon            TEXT NOT NULL DEFAULT '',
  adres               TEXT NOT NULL DEFAULT '',
  postcode            TEXT NOT NULL DEFAULT '',
  plaats              TEXT NOT NULL DEFAULT '',
  kvk                 TEXT NOT NULL DEFAULT '',
  btw_id              TEXT NOT NULL DEFAULT '',
  betaaltermijn_dagen INTEGER NOT NULL DEFAULT 30,
  actief              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projecten (
  id            INTEGER PRIMARY KEY,
  klant_id      INTEGER NOT NULL REFERENCES klanten(id),
  naam          TEXT NOT NULL,
  projectnummer TEXT NOT NULL DEFAULT '',
  locatie       TEXT NOT NULL DEFAULT '',
  -- btw op de verkoopfactuur: '21' of 'verlegd' (onderaanneming / inlening in de bouw)
  verkoop_btw   TEXT NOT NULL DEFAULT '21' CHECK (verkoop_btw IN ('21', 'verlegd')),
  actief        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS zzpers (
  id                      INTEGER PRIMARY KEY,
  naam                    TEXT NOT NULL,
  bedrijfsnaam            TEXT NOT NULL DEFAULT '',
  email                   TEXT NOT NULL DEFAULT '',
  telefoon                TEXT NOT NULL DEFAULT '',
  adres                   TEXT NOT NULL DEFAULT '',
  postcode                TEXT NOT NULL DEFAULT '',
  plaats                  TEXT NOT NULL DEFAULT '',
  kvk                     TEXT NOT NULL DEFAULT '',
  btw_id                  TEXT NOT NULL DEFAULT '',
  iban                    TEXT NOT NULL DEFAULT '',
  -- 'normaal' = btw-plichtig, 'kor' = kleineondernemersregeling (geen btw)
  btw_regime              TEXT NOT NULL DEFAULT 'normaal' CHECK (btw_regime IN ('normaal', 'kor')),
  -- Schriftelijk akkoord voor self-billing (factuur uitgereikt door afnemer)
  selfbilling_akkoord_op  TEXT,
  selfbilling_volgnummer  INTEGER NOT NULL DEFAULT 0,
  betaaltermijn_dagen     INTEGER NOT NULL DEFAULT 14,
  notities                TEXT NOT NULL DEFAULT '',
  actief                  INTEGER NOT NULL DEFAULT 1,
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS certificaten (
  id         INTEGER PRIMARY KEY,
  zzp_id     INTEGER NOT NULL REFERENCES zzpers(id) ON DELETE CASCADE,
  soort      TEXT NOT NULL,
  nummer     TEXT NOT NULL DEFAULT '',
  geldig_tot TEXT
);

CREATE TABLE IF NOT EXISTS plaatsingen (
  id                    INTEGER PRIMARY KEY,
  zzp_id                INTEGER NOT NULL REFERENCES zzpers(id),
  project_id            INTEGER NOT NULL REFERENCES projecten(id),
  functie               TEXT NOT NULL DEFAULT '',
  opdracht              TEXT NOT NULL DEFAULT '',
  inkoop_cents          INTEGER NOT NULL CHECK (inkoop_cents >= 0),
  verkoop_cents         INTEGER NOT NULL CHECK (verkoop_cents >= 0),
  -- btw op de (self-billing) inkoopfactuur van de zzp'er aan RKS
  inkoop_btw            TEXT NOT NULL DEFAULT 'verlegd' CHECK (inkoop_btw IN ('21', 'verlegd', 'geen')),
  startdatum            TEXT,
  einddatum             TEXT,
  modelovereenkomst     TEXT NOT NULL DEFAULT '',
  contract_getekend_op  TEXT,
  goedkeurder_naam      TEXT NOT NULL DEFAULT '',
  goedkeurder_email     TEXT NOT NULL DEFAULT '',
  goedkeurder_telefoon  TEXT NOT NULL DEFAULT '',
  actief                INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  naam            TEXT NOT NULL,
  password_hash   TEXT,
  rol             TEXT NOT NULL CHECK (rol IN ('admin', 'zzp', 'klant')),
  zzp_id          INTEGER REFERENCES zzpers(id),
  klant_id        INTEGER REFERENCES klanten(id),
  invite_token    TEXT UNIQUE,
  invite_expires  TEXT,
  actief          INTEGER NOT NULL DEFAULT 1,
  laatst_ingelogd TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (rol <> 'zzp' OR zzp_id IS NOT NULL),
  CHECK (rol <> 'klant' OR klant_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf       TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS urenstaten (
  id                 INTEGER PRIMARY KEY,
  plaatsing_id       INTEGER NOT NULL REFERENCES plaatsingen(id),
  week               TEXT NOT NULL,              -- ISO-week, bv. '2026-W38'
  status             TEXT NOT NULL DEFAULT 'concept'
                     CHECK (status IN ('concept', 'ingediend', 'goedgekeurd', 'afgekeurd')),
  -- tarieven worden vastgelegd bij goedkeuring, zodat latere tariefwijzigingen oude weken niet raken
  inkoop_cents       INTEGER,
  verkoop_cents      INTEGER,
  ingediend_op       TEXT,
  goedgekeurd_op     TEXT,
  goedgekeurd_door   TEXT NOT NULL DEFAULT '',
  afkeur_reden       TEXT NOT NULL DEFAULT '',
  approval_token     TEXT UNIQUE,
  approval_expires   TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (plaatsing_id, week)
);

CREATE TABLE IF NOT EXISTS uren (
  id           INTEGER PRIMARY KEY,
  urenstaat_id INTEGER NOT NULL REFERENCES urenstaten(id) ON DELETE CASCADE,
  datum        TEXT NOT NULL,
  minuten      INTEGER NOT NULL DEFAULT 0 CHECK (minuten >= 0 AND minuten <= 1440),
  omschrijving TEXT NOT NULL DEFAULT '',
  UNIQUE (urenstaat_id, datum)
);

CREATE TABLE IF NOT EXISTS facturen (
  id             INTEGER PRIMARY KEY,
  soort          TEXT NOT NULL CHECK (soort IN ('verkoop', 'inkoop')),
  nummer         TEXT UNIQUE,
  status         TEXT NOT NULL DEFAULT 'concept'
                 CHECK (status IN ('concept', 'wacht_op_factuur', 'definitief', 'verzonden', 'betaald')),
  klant_id       INTEGER REFERENCES klanten(id),
  zzp_id         INTEGER REFERENCES zzpers(id),
  week           TEXT NOT NULL,
  btw_regeling   TEXT NOT NULL CHECK (btw_regeling IN ('21', 'verlegd', 'geen')),
  selfbilling    INTEGER NOT NULL DEFAULT 0,
  factuurdatum   TEXT,
  vervaldatum    TEXT,
  subtotaal_cents INTEGER NOT NULL DEFAULT 0,
  btw_cents      INTEGER NOT NULL DEFAULT 0,
  totaal_cents   INTEGER NOT NULL DEFAULT 0,
  extern_nummer  TEXT NOT NULL DEFAULT '',     -- factuurnummer van de zzp'er als die zelf factureert
  verzonden_op   TEXT,
  betaald_op     TEXT,
  public_token   TEXT UNIQUE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((soort = 'verkoop' AND klant_id IS NOT NULL) OR (soort = 'inkoop' AND zzp_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS factuurregels (
  id            INTEGER PRIMARY KEY,
  factuur_id    INTEGER NOT NULL REFERENCES facturen(id) ON DELETE CASCADE,
  urenstaat_id  INTEGER REFERENCES urenstaten(id),
  omschrijving  TEXT NOT NULL,
  minuten       INTEGER NOT NULL,
  tarief_cents  INTEGER NOT NULL,
  bedrag_cents  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  wie       TEXT NOT NULL,
  actie     TEXT NOT NULL,
  entiteit  TEXT NOT NULL,
  entiteit_id INTEGER,
  details   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_urenstaten_week ON urenstaten(week);
CREATE INDEX IF NOT EXISTS idx_urenstaten_status ON urenstaten(status);
CREATE INDEX IF NOT EXISTS idx_facturen_soort_status ON facturen(soort, status);
CREATE INDEX IF NOT EXISTS idx_plaatsingen_zzp ON plaatsingen(zzp_id);
CREATE INDEX IF NOT EXISTS idx_projecten_klant ON projecten(klant_id);
