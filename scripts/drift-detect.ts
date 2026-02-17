#!/usr/bin/env tsx
/**
 * Upstream drift detection for French Law MCP.
 *
 * Compares anchored upstream pages against expected normalized hashes defined
 * in fixtures/golden-hashes.json.
 *
 * Exit codes:
 *   0 => no drift (or only skipped anchors)
 *   1 => operational error(s)
 *   2 => drift detected
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HASH_FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'golden-hashes.json');
const REQUEST_TIMEOUT_MS = 15_000;
const REQUEST_DELAY_MS = 1_000;

interface GoldenHashEntry {
  id: string;
  description: string;
  upstream_url: string;
  selector_hint: string;
  expected_sha256: string;
  expected_snippet: string;
}

interface GoldenHashesFile {
  provisions: GoldenHashEntry[];
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sha256(text: string): string {
  return createHash('sha256').update(normalizeText(text)).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'France-Law-MCP-DriftDetect/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const payload = readFileSync(HASH_FIXTURE_PATH, 'utf-8');
  const fixture = JSON.parse(payload) as GoldenHashesFile;

  if (!Array.isArray(fixture.provisions)) {
    throw new Error('fixtures/golden-hashes.json is missing a "provisions" array.');
  }

  let ok = 0;
  let drift = 0;
  let errors = 0;
  let skipped = 0;

  console.log(`Drift detection: checking ${fixture.provisions.length} anchors...\n`);

  for (const entry of fixture.provisions) {
    if (!entry.expected_sha256 || entry.expected_sha256 === 'COMPUTE_ON_FIRST_RUN') {
      console.log(`  SKIP  ${entry.id}: ${entry.description} (hash not initialized)`);
      skipped++;
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    try {
      const body = await fetchText(entry.upstream_url);
      const hash = sha256(body);

      if (entry.expected_snippet) {
        const snippet = normalizeText(entry.expected_snippet);
        if (!normalizeText(body).includes(snippet)) {
          console.log(`  DRIFT ${entry.id}: expected snippet not found`);
          console.log(`        Hint: ${entry.selector_hint}`);
          drift++;
          await sleep(REQUEST_DELAY_MS);
          continue;
        }
      }

      if (hash !== entry.expected_sha256) {
        console.log(`  DRIFT ${entry.id}: ${entry.description}`);
        console.log(`        Expected: ${entry.expected_sha256}`);
        console.log(`        Got:      ${hash}`);
        drift++;
      } else {
        console.log(`  OK    ${entry.id}: ${entry.description}`);
        ok++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR ${entry.id}: ${message}`);
      errors++;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\nResults: ${ok} OK, ${drift} drift, ${errors} errors, ${skipped} skipped`);

  if (drift > 0) process.exit(2);
  if (errors > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
