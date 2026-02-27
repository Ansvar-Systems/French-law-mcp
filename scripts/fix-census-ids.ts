#!/usr/bin/env tsx
/**
 * One-time fix script: Replace title-derived slug IDs with LEGI identifiers.
 *
 * Problem: 112,308 census entries but only 59,659 unique IDs due to
 * title-based slugification collisions (e.g. 226 "arrete-du-6-octobre-2021").
 *
 * Fix: Use the LEGI identifier (LEGITEXT/JORFTEXT number) lowercased as the
 * document ID. These are guaranteed unique across the entire DILA corpus.
 * Well-known codes (code-civil, code-penal, etc.) keep their human-readable IDs.
 *
 * Usage: npx tsx scripts/fix-census-ids.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CENSUS_PATH = path.resolve(__dirname, '../data/census.json');

// Well-known IDs that should be preserved (match census.ts)
const WELL_KNOWN_IDS: Record<string, string> = {
  'LEGITEXT000006070719': 'code-penal',
  'LEGITEXT000006070721': 'code-civil',
  'LEGITEXT000005634379': 'code-commerce',
  'LEGITEXT000006071307': 'code-defense',
  'LEGITEXT000006070987': 'code-postes-telecom',
  'LEGITEXT000025503132': 'code-securite-interieure',
  'LEGITEXT000006072050': 'code-travail',
  'LEGITEXT000006068624': 'loi-informatique-libertes',
  'JORFTEXT000000886460': 'loi-informatique-libertes',
};

interface CensusLaw {
  id: string;
  title: string;
  title_en: string | null;
  identifier: string;
  url: string | null;
  status: string;
  category: string;
  classification: string;
  classification_reason: string;
  ingested: boolean;
  provision_count: number;
  ingestion_date: string | null;
}

interface Census {
  schema_version: string;
  jurisdiction: string;
  jurisdiction_name: string;
  portal: string;
  census_date: string;
  agent: string;
  summary: {
    total_laws: number;
    total_provisions: number;
    ingestable: number;
    ocr_needed: number;
    inaccessible: number;
    metadata_only?: number;
    excluded: number;
    total_ingested?: number;
  };
  laws: CensusLaw[];
}

function main(): void {
  console.log('=== Fix Census IDs: Title Slugs -> LEGI Identifiers ===\n');

  const census: Census = JSON.parse(fs.readFileSync(CENSUS_PATH, 'utf-8'));
  console.log(`Loaded census: ${census.laws.length} entries`);

  // --- Phase 1: Diagnose current state ---
  const oldIds = census.laws.map(l => l.id);
  const oldUniqueIds = new Set(oldIds);
  console.log(`\nBefore fix:`);
  console.log(`  Total entries: ${oldIds.length}`);
  console.log(`  Unique IDs: ${oldUniqueIds.size}`);
  console.log(`  Collisions: ${oldIds.length - oldUniqueIds.size}`);

  // --- Phase 2: Fix all IDs ---
  let changedCount = 0;
  for (const law of census.laws) {
    const wellKnown = WELL_KNOWN_IDS[law.identifier];
    const newId = wellKnown ?? law.identifier.toLowerCase();
    if (law.id !== newId) {
      changedCount++;
    }
    law.id = newId;
  }

  // --- Phase 3: Handle the loi-informatique-libertes duplicate ---
  // LEGITEXT000006068624 and JORFTEXT000000886460 both map to 'loi-informatique-libertes'.
  // These are the same law (one is the LEGI consolidated version, one is the JORF original).
  // Keep only the LEGITEXT version (consolidated), change JORF to its identifier.
  const lilEntries = census.laws.filter(l => l.id === 'loi-informatique-libertes');
  if (lilEntries.length > 1) {
    for (const entry of lilEntries) {
      if (entry.identifier === 'JORFTEXT000000886460') {
        entry.id = entry.identifier.toLowerCase();
        console.log(`  Resolved loi-informatique-libertes duplicate: JORFTEXT000000886460 -> ${entry.id}`);
      }
    }
  }

  // --- Phase 4: Fix the 7 duplicate ingested entries ---
  // These are cases where two different LEGI texts have the same title and
  // both were marked as ingested. With unique LEGI-based IDs they are now
  // distinct entries, so no further dedup is needed -- just verify.
  const idMap = new Map<string, CensusLaw[]>();
  for (const law of census.laws) {
    if (!idMap.has(law.id)) idMap.set(law.id, []);
    idMap.get(law.id)!.push(law);
  }
  const remainingCollisions = [...idMap.entries()].filter(([_, v]) => v.length > 1);

  // --- Phase 5: Verify uniqueness ---
  const newIds = census.laws.map(l => l.id);
  const newUniqueIds = new Set(newIds);
  console.log(`\nAfter fix:`);
  console.log(`  Total entries: ${newIds.length}`);
  console.log(`  Unique IDs: ${newUniqueIds.size}`);
  console.log(`  Collisions: ${newIds.length - newUniqueIds.size}`);
  console.log(`  Changed IDs: ${changedCount}`);

  if (remainingCollisions.length > 0) {
    console.log(`\n  Remaining collisions (${remainingCollisions.length}):`);
    for (const [id, entries] of remainingCollisions) {
      console.log(`    ${entries.length}x ${id}`);
      for (const e of entries) {
        console.log(`      identifier: ${e.identifier}, ingested: ${e.ingested}`);
      }
    }
  }

  // --- Phase 6: Update summary counts ---
  const ingestedCount = census.laws.filter(l => l.ingested).length;
  const ingestable = census.laws.filter(l => l.classification === 'ingestable').length;
  const metadataOnly = census.laws.filter(l => l.classification === 'metadata_only').length;
  const totalProvisions = census.laws.reduce((sum, l) => sum + l.provision_count, 0);

  census.summary.total_laws = census.laws.length;
  census.summary.total_provisions = totalProvisions;
  census.summary.ingestable = ingestable;
  census.summary.metadata_only = metadataOnly;
  census.summary.total_ingested = ingestedCount;

  console.log(`\nUpdated summary:`);
  console.log(`  total_laws: ${census.summary.total_laws}`);
  console.log(`  total_provisions: ${census.summary.total_provisions}`);
  console.log(`  ingestable: ${census.summary.ingestable}`);
  console.log(`  metadata_only: ${census.summary.metadata_only}`);
  console.log(`  total_ingested: ${census.summary.total_ingested}`);

  // --- Phase 7: Write fixed census ---
  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2), 'utf-8');
  console.log(`\nWritten: ${CENSUS_PATH}`);

  // Final assertion
  if (newUniqueIds.size === newIds.length) {
    console.log('\nAll IDs are unique. Fix complete.');
  } else {
    console.error(`\nERROR: ${newIds.length - newUniqueIds.size} collisions remain.`);
    process.exit(1);
  }
}

main();
