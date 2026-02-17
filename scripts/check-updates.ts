#!/usr/bin/env tsx
/**
 * Check for French law source updates.
 *
 * Detects whether a newer LEGI open-data archive is available than the
 * timestamp recorded in the local database metadata.
 *
 * Usage:
 *   npm run check-updates
 *   CHECK_UPDATES_STRICT=1 npm run check-updates
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../data/database.db');
const LEGI_LIST_URL = 'https://echanges.dila.gouv.fr/OPENDATA/LEGI/';
const ARCHIVE_PATTERN = /Freemium_legi_global_(\d{8}-\d{6})\.tar\.gz/gi;
const REQUEST_TIMEOUT_MS = 15_000;
const STALE_DAYS_THRESHOLD = 30;
const STRICT_MODE = process.env['CHECK_UPDATES_STRICT'] === '1' || process.env['CI'] === 'true';

interface CheckSummary {
  checked_at: string;
  strict_mode: boolean;
  db_exists: boolean;
  built_at: string | null;
  legal_documents: number;
  legal_provisions: number;
  latest_archive_name: string | null;
  latest_archive_timestamp: string | null;
  has_update: boolean;
  stale_days: number | null;
  warnings: string[];
  errors: string[];
}

interface ArchiveInfo {
  name: string;
  timestamp: string;
}

function parseArchiveTokenToIso(token: string): string | null {
  const match = token.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

async function fetchLatestArchive(): Promise<ArchiveInfo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(LEGI_LIST_URL, {
      headers: {
        'User-Agent': 'France-Law-MCP/1.0.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${LEGI_LIST_URL}`);
    }

    const html = await response.text();
    const candidates = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = ARCHIVE_PATTERN.exec(html)) !== null) {
      candidates.add(match[1]);
    }

    if (candidates.size === 0) {
      throw new Error('No LEGI archive names found in listing');
    }

    const latestToken = [...candidates].sort().at(-1);
    if (!latestToken) {
      throw new Error('Unable to determine latest LEGI archive');
    }

    return {
      name: `Freemium_legi_global_${latestToken}.tar.gz`,
      timestamp: latestToken,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

async function main(): Promise<void> {
  const summary: CheckSummary = {
    checked_at: new Date().toISOString(),
    strict_mode: STRICT_MODE,
    db_exists: fs.existsSync(DB_PATH),
    built_at: null,
    legal_documents: 0,
    legal_provisions: 0,
    latest_archive_name: null,
    latest_archive_timestamp: null,
    has_update: false,
    stale_days: null,
    warnings: [],
    errors: [],
  };

  console.log('French Law MCP - Update Checker');
  console.log('');

  if (!summary.db_exists) {
    summary.errors.push(`Database not found: ${DB_PATH}`);
    console.log(`ERROR: Database not found: ${DB_PATH}`);
    console.log('Run "npm run build:db" first.');
    printSummary(summary);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  try {
    const builtAtRow = db
      .prepare("SELECT value FROM db_metadata WHERE key = 'built_at'")
      .get() as { value: string } | undefined;
    summary.built_at = toIsoOrNull(builtAtRow?.value);

    summary.legal_documents = Number(
      (db.prepare('SELECT COUNT(*) AS count FROM legal_documents').get() as { count: number }).count,
    );
    summary.legal_provisions = Number(
      (db.prepare('SELECT COUNT(*) AS count FROM legal_provisions').get() as { count: number }).count,
    );
  } finally {
    db.close();
  }

  if (summary.built_at) {
    summary.stale_days = daysSince(summary.built_at);
    if (summary.stale_days > STALE_DAYS_THRESHOLD) {
      summary.warnings.push(
        `Database is ${summary.stale_days} days old (threshold ${STALE_DAYS_THRESHOLD} days).`,
      );
    }
  } else {
    summary.warnings.push('No "built_at" metadata found in database.');
  }

  console.log(`Database: ${summary.legal_documents} documents, ${summary.legal_provisions} provisions`);
  console.log(`Built at: ${summary.built_at ?? 'unknown'}`);

  try {
    const latest = await fetchLatestArchive();
    summary.latest_archive_name = latest.name;
    summary.latest_archive_timestamp = parseArchiveTokenToIso(latest.timestamp);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.errors.push(`Source check failed: ${message}`);
    console.log(`ERROR: ${message}`);

    if (!STRICT_MODE) {
      summary.warnings.push(
        'Non-strict mode: source fetch error does not fail the command. Set CHECK_UPDATES_STRICT=1 to enforce.',
      );
    }

    printSummary(summary);
    process.exit(STRICT_MODE ? 2 : 0);
  }

  console.log(`Latest LEGI archive: ${summary.latest_archive_name}`);
  console.log(`Archive timestamp: ${summary.latest_archive_timestamp ?? 'unknown'}`);

  if (summary.built_at && summary.latest_archive_timestamp) {
    summary.has_update =
      new Date(summary.latest_archive_timestamp).getTime() > new Date(summary.built_at).getTime();
  } else {
    summary.has_update = false;
    summary.warnings.push(
      'Could not compare source archive timestamp against local built_at metadata.',
    );
  }

  if (summary.has_update) {
    console.log('');
    console.log('UPDATE AVAILABLE');
    console.log('A newer LEGI archive exists than the currently built database.');
    console.log('Suggested next steps:');
    console.log('  npm run ingest:legi');
    console.log('  npm run build:db');
  } else {
    console.log('');
    console.log('UP TO DATE');
    console.log('No newer LEGI archive detected.');
  }

  for (const warning of summary.warnings) {
    console.log(`WARNING: ${warning}`);
  }

  printSummary(summary);
  process.exit(summary.has_update ? 1 : 0);
}

function printSummary(summary: CheckSummary): void {
  console.log('');
  console.log(`SUMMARY_JSON: ${JSON.stringify(summary)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(2);
});
