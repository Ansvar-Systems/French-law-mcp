import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const vercelConfigPath = join(__dirname, '..', '..', 'vercel.json');

describe('vercel.json', () => {
  it('routes /version to version mode on health endpoint', () => {
    const payload = readFileSync(vercelConfigPath, 'utf-8');
    const config = JSON.parse(payload) as {
      rewrites?: Array<{ source: string; destination: string }>;
      functions?: Record<string, { includeFiles?: string }>;
    };

    const versionRewrite = config.rewrites?.find((entry) => entry.source === '/version');
    expect(versionRewrite?.destination).toBe('/api/health?version');
  });

  it('includes SQLite WASM payload in function bundle', () => {
    const payload = readFileSync(vercelConfigPath, 'utf-8');
    const config = JSON.parse(payload) as {
      functions?: Record<string, { includeFiles?: string }>;
    };

    const includeFiles = config.functions?.['api/mcp.ts']?.includeFiles ?? '';
    expect(includeFiles).toContain('data/database.db');
    expect(includeFiles).toContain('node-sqlite3-wasm.wasm');
  });
});
