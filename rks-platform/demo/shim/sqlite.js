// node:sqlite (DatabaseSync) op basis van sql.js, SQLite in de browser.
let SQL = null;
let initialBytes = null;

export const useSqlJs = (sqlJs) => { SQL = sqlJs; };
// De volgende new DatabaseSync() start vanaf deze opgeslagen database.
export const restoreFrom = (bytes) => { initialBytes = bytes; };

const bindable = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);

class StatementSync {
  constructor(owner, sql) {
    this.owner = owner;
    this.sql = sql;
  }

  // sql.js geeft statements vrij bij export(), dus elke aanroep bereidt opnieuw voor.
  #with(params, fn) {
    const s = this.owner.db.prepare(this.sql);
    try {
      if (params.length) s.bind(params.map(bindable));
      return fn(s);
    } finally {
      s.free();
    }
  }

  get(...params) { return this.#with(params, (s) => (s.step() ? s.getAsObject() : undefined)); }

  all(...params) {
    return this.#with(params, (s) => {
      const rows = [];
      while (s.step()) rows.push(s.getAsObject());
      return rows;
    });
  }

  run(...params) {
    this.#with(params, (s) => s.step());
    const { db } = this.owner;
    const changes = db.getRowsModified();
    const lastInsertRowid = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    return { changes, lastInsertRowid };
  }
}

export class DatabaseSync {
  constructor() {
    if (!SQL) throw new Error('sql.js is nog niet geladen');
    this.db = initialBytes ? new SQL.Database(initialBytes) : new SQL.Database();
    initialBytes = null;
  }

  exec(sql) {
    // WAL en busy_timeout hebben geen betekenis in het geheugen van de browser.
    if (/^\s*PRAGMA\s+(journal_mode|busy_timeout)\b/i.test(sql)) return;
    this.db.exec(sql);
  }

  prepare(sql) { return new StatementSync(this, sql); }

  // Momentopname voor opslag. sql.js opent de database daarbij opnieuw, dus de pragma moet terug.
  export() {
    const bytes = this.db.export();
    this.db.exec('PRAGMA foreign_keys = ON');
    return bytes;
  }

  close() { this.db.close(); }
}
