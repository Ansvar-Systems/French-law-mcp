import Database from '@ansvar/mcp-sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tempDbPaths = new WeakMap<InstanceType<typeof Database>, string>();

export function openReadonlyDatabase(): InstanceType<typeof Database> {
  const sourcePath = join(__dirname, '..', '..', 'data', 'database.db');
  const tempPath = join(
    tmpdir(),
    `fr-law-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`,
  );
  copyFileSync(sourcePath, tempPath);

  const db = new Database(tempPath, { readonly: true });
  db.pragma('foreign_keys = ON');
  tempDbPaths.set(db, tempPath);
  return db;
}

export function closeDatabase(db: InstanceType<typeof Database> | undefined): void {
  if (!db) return;
  const tempPath = tempDbPaths.get(db);
  db.close();
  if (tempPath) {
    rmSync(tempPath, { force: true });
  }
}
