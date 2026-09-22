// node:fs voor de browserdemo: alleen het databaseschema wordt gelezen.
import schema from '../../src/schema.sql';

export function readFileSync(path) {
  if (String(path).endsWith('schema.sql')) return schema;
  throw new Error(`Bestand niet beschikbaar in de demo: ${path}`);
}
export function mkdirSync() {}
