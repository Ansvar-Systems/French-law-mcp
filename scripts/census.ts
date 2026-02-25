#!/usr/bin/env tsx
/**
 * Census script for French Law MCP.
 *
 * Enumerates ALL codes and consolidated laws (TNC) from the DILA LEGI
 * open data archive.  Writes data/census.json in golden standard format.
 *
 * Strategy:
 *   1. Download the Freemium LEGI global archive (if not cached)
 *   2. Extract it (if not already extracted)
 *   3. Walk the extracted directory tree to discover:
 *      a) All codes  (code_en_vigueur/LEGI/TEXT/...)
 *      b) All TNC — textes non codifiés (TNC_en_vigueur/JORF/TEXT/...)
 *   4. Parse the TEXTE_VERSION.xml for each text to get title & metadata
 *   5. Count article XML files per text
 *   6. Write data/census.json
 *
 * Usage:
 *   npx tsx scripts/census.ts
 *   npx tsx scripts/census.ts --extracted /tmp/legi_extracted
 *   npx tsx scripts/census.ts --archive /path/to/archive.tar.gz
 *   npx tsx scripts/census.ts --codes-only         # Skip TNC (laws)
 *
 * Data source: https://echanges.dila.gouv.fr/OPENDATA/LEGI/
 * Licence: Licence Ouverte v2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const CENSUS_PATH = path.join(DATA_DIR, 'census.json');
const ARCHIVE_URL = 'https://echanges.dila.gouv.fr/OPENDATA/LEGI/Freemium_legi_global_20250713-140000.tar.gz';
const DEFAULT_ARCHIVE_PATH = '/tmp/legi_global.tar.gz';
const DEFAULT_EXTRACT_DIR = '/tmp/legi_extracted';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliArgs {
  archive?: string;
  extracted?: string;
  codesOnly: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let archive: string | undefined;
  let extracted: string | undefined;
  let codesOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--archive' && args[i + 1]) { archive = args[i + 1]; i++; }
    else if (args[i] === '--extracted' && args[i + 1]) { extracted = args[i + 1]; i++; }
    else if (args[i] === '--codes-only') { codesOnly = true; }
  }
  return { archive, extracted, codesOnly };
}

// ---------------------------------------------------------------------------
// XML parser for TEXTE_VERSION.xml metadata
// ---------------------------------------------------------------------------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

interface TextMetadata {
  id: string;          // LEGITEXT or JORFTEXT ID
  title: string;
  titleEn?: string;
  shortName?: string;
  status: 'in_force' | 'amended' | 'repealed';
  issuedDate?: string;
  inForceDate?: string;
  nature?: string;     // CODE, LOI, ORDONNANCE, DECRET, etc.
}

/**
 * Parse the texte_version.xml found at the root of a LEGI text directory
 * to extract metadata.
 */
function parseTexteVersion(xmlPath: string): TextMetadata | null {
  try {
    if (!fs.existsSync(xmlPath)) return null;
    const xml = fs.readFileSync(xmlPath, 'utf-8');
    const parsed = xmlParser.parse(xml);

    // Navigate: TEXTE_VERSION > META > META_COMMUN + META_SPEC > META_TEXTE_VERSION
    const texteVersion = parsed.TEXTE_VERSION ?? parsed;
    const meta = texteVersion?.META;
    const metaCommun = meta?.META_COMMUN;
    const metaSpec = meta?.META_SPEC;
    const metaTexte = metaSpec?.META_TEXTE_VERSION ?? metaSpec?.META_TEXTE_CHRONICLE;

    const id = String(metaCommun?.ID ?? '');
    const nature = String(metaCommun?.NATURE ?? metaTexte?.NATURE ?? '');
    const titre = String(metaTexte?.TITRE ?? metaTexte?.TITREFULL ?? '');
    const titreShort = String(metaTexte?.TITRECOURT ?? '');
    const etat = String(metaTexte?.ETAT ?? 'VIGUEUR');
    const dateDebut = metaTexte?.DATE_DEBUT ? String(metaTexte.DATE_DEBUT) : undefined;
    const dateFin = metaTexte?.DATE_FIN ? String(metaTexte.DATE_FIN) : undefined;

    // Determine status
    let status: 'in_force' | 'amended' | 'repealed' = 'in_force';
    const etatUpper = etat.toUpperCase();
    if (etatUpper === 'ABROGE' || etatUpper === 'ABROGE_DIFF') {
      status = 'repealed';
    } else if (etatUpper === 'MODIFIE') {
      status = 'amended';
    }

    // Skip if clearly not in force
    if (dateFin && !dateFin.startsWith('2999') && dateFin < new Date().toISOString().split('T')[0]) {
      status = 'repealed';
    }

    return {
      id,
      title: titre || titreShort || id,
      shortName: titreShort || undefined,
      status,
      issuedDate: dateDebut,
      nature: nature || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Count article XML files under a text directory.
 */
function countArticleFiles(textDir: string): number {
  let count = 0;
  const walk = (dir: string) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Only walk into 'article' directories and their children
        walk(fp);
      } else if (entry.name.startsWith('LEGIARTI') && entry.name.endsWith('.xml')) {
        count++;
      }
    }
  };
  walk(textDir);
  return count;
}

/**
 * Find all TEXTE directories under a base path.
 * Returns an array of { dir, textId } where textId is the LEGITEXT/JORFTEXT folder name.
 */
function findTextDirectories(baseDir: string): Array<{ dir: string; textId: string }> {
  const results: Array<{ dir: string; textId: string }> = [];

  if (!fs.existsSync(baseDir)) return results;

  // Walk up to the TEXT level, then look for LEGITEXT*/JORFTEXT* dirs
  const walkForTexts = (dir: string, depth: number) => {
    if (depth > 12) return; // safety guard
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const fp = path.join(dir, name);

      if (name.startsWith('LEGITEXT') || name.startsWith('JORFTEXT')) {
        results.push({ dir: fp, textId: name });
      } else {
        walkForTexts(fp, depth + 1);
      }
    }
  };

  walkForTexts(baseDir, 0);
  return results;
}

// ---------------------------------------------------------------------------
// Census entry
// ---------------------------------------------------------------------------

interface CensusLaw {
  id: string;
  title: string;
  title_en: string | null;
  identifier: string;
  url: string | null;
  status: string;
  category: string;
  classification: 'ingestable' | 'inaccessible' | 'metadata_only';
  classification_reason: string;
  ingested: boolean;
  provision_count: number;
  ingestion_date: string | null;
}

interface CensusOutput {
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
    excluded: number;
  };
  laws: CensusLaw[];
}

function textIdToUrl(textId: string): string | null {
  if (textId.startsWith('LEGITEXT')) {
    return `https://www.legifrance.gouv.fr/codes/texte_lc/${textId}/`;
  } else if (textId.startsWith('JORFTEXT')) {
    return `https://www.legifrance.gouv.fr/loda/id/${textId}`;
  }
  return null;
}

/**
 * Well-known LEGITEXT IDs to stable document IDs.
 * These match the IDs established in the original seed data
 * and are referenced by eu-references.json.
 */
const WELL_KNOWN_IDS: Record<string, string> = {
  // Only IDs verified from the original ingest-legi.ts TARGET_CODES
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

function textIdToDocumentId(textId: string, title: string): string {
  // Use well-known mapping if available
  if (WELL_KNOWN_IDS[textId]) return WELL_KNOWN_IDS[textId];

  // Build a kebab-case ID from the title
  const id = title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return id || textId.toLowerCase();
}

function categorizeText(nature: string | undefined, title: string): string {
  const n = (nature ?? '').toUpperCase();
  const t = title.toLowerCase();

  if (n === 'CODE' || t.startsWith('code ')) return 'code';
  if (n === 'LOI' || t.includes('loi n')) return 'loi';
  if (n === 'ORDONNANCE') return 'ordonnance';
  if (n === 'DECRET' || n === 'DÉCRET') return 'decret';
  if (t.includes('convention')) return 'convention';
  return 'other';
}

// ---------------------------------------------------------------------------
// Archive download + extraction
// ---------------------------------------------------------------------------

function ensureArchive(archivePath: string): void {
  if (fs.existsSync(archivePath)) {
    const size = fs.statSync(archivePath).size;
    console.log(`Using existing archive: ${archivePath} (${(size / 1024 / 1024).toFixed(0)}MB)`);
    return;
  }

  console.log(`Downloading LEGI archive from ${ARCHIVE_URL}...`);
  console.log('This is ~1.1GB and may take several minutes.');
  execFileSync('curl', ['-fSL', '--progress-bar', '-o', archivePath, ARCHIVE_URL], {
    stdio: 'inherit',
    timeout: 1_800_000, // 30 min
  });
  console.log('Download complete.');
}

function ensureExtracted(archivePath: string, extractDir: string): void {
  // Check if already extracted by looking for the legi/ directory
  if (fs.existsSync(path.join(extractDir, 'legi'))) {
    console.log(`Using previously extracted archive at ${extractDir}`);
    return;
  }

  if (fs.existsSync(extractDir)) {
    execFileSync('rm', ['-rf', extractDir]);
  }
  fs.mkdirSync(extractDir, { recursive: true });

  console.log(`Extracting archive to ${extractDir}...`);
  console.log('This extracts ~10GB, takes 2-5 minutes...');
  execFileSync('tar', ['xzf', archivePath, '-C', extractDir], {
    timeout: 1_200_000, // 20 min
    maxBuffer: 50 * 1024 * 1024,
    stdio: 'inherit',
  });
  console.log('Extraction complete.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { archive, extracted, codesOnly } = parseArgs();

  console.log('=== French Law MCP — Census ===\n');

  let extractDir: string;

  if (extracted) {
    extractDir = extracted;
    console.log(`Using pre-extracted directory: ${extractDir}`);
  } else {
    const archivePath = archive ?? DEFAULT_ARCHIVE_PATH;
    ensureArchive(archivePath);
    extractDir = DEFAULT_EXTRACT_DIR;
    ensureExtracted(archivePath, extractDir);
  }

  // Discover all texts
  const codesBaseDir = path.join(extractDir, 'legi/global/code_et_TNC_en_vigueur/code_en_vigueur');
  const tncBaseDir = path.join(extractDir, 'legi/global/code_et_TNC_en_vigueur/TNC_en_vigueur');

  console.log('\nScanning for codes...');
  const codeTexts = findTextDirectories(codesBaseDir);
  console.log(`  Found ${codeTexts.length} code text directories`);

  let tncTexts: Array<{ dir: string; textId: string }> = [];
  if (!codesOnly) {
    console.log('Scanning for TNC (consolidated laws)...');
    tncTexts = findTextDirectories(tncBaseDir);
    console.log(`  Found ${tncTexts.length} TNC text directories`);
  }

  const allTexts = [...codeTexts, ...tncTexts];
  console.log(`\nTotal texts to process: ${allTexts.length}`);

  // Process each text
  const laws: CensusLaw[] = [];
  let totalArticles = 0;
  let processed = 0;

  for (const { dir, textId } of allTexts) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`  Processing ${processed}/${allTexts.length}...`);
    }

    // LEGI archive stores metadata at texte/version/{LEGITEXT_ID}.xml
    let metadataPath = path.join(dir, 'texte', 'version', `${textId}.xml`);
    if (!fs.existsSync(metadataPath)) {
      // Try finding any XML in texte/version/
      const versionDir = path.join(dir, 'texte', 'version');
      if (fs.existsSync(versionDir)) {
        const files = fs.readdirSync(versionDir).filter(f => f.endsWith('.xml'));
        if (files.length > 0) {
          metadataPath = path.join(versionDir, files[0]);
        }
      }
    }
    if (!fs.existsSync(metadataPath)) {
      // Fallback: search recursively
      const texteVersionPaths = findTexteVersionXml(dir);
      if (texteVersionPaths.length > 0) {
        metadataPath = texteVersionPaths[0];
      }
    }

    const metadata = parseTexteVersion(metadataPath);
    const articleCount = countArticleFiles(dir);
    totalArticles += articleCount;

    const title = metadata?.title ?? textId;
    const docId = textIdToDocumentId(textId, title);
    const category = categorizeText(metadata?.nature, title);
    const status = metadata?.status ?? 'in_force';

    // Classify
    let classification: 'ingestable' | 'inaccessible' | 'metadata_only' = 'ingestable';
    let classificationReason = 'Available in LEGI archive with XML articles';
    if (articleCount === 0) {
      classification = 'metadata_only';
      classificationReason = 'No article XML files found in archive';
    }

    laws.push({
      id: docId,
      title,
      title_en: null,
      identifier: textId,
      url: textIdToUrl(textId),
      status,
      category,
      classification,
      classification_reason: classificationReason,
      ingested: false,
      provision_count: articleCount,
      ingestion_date: null,
    });
  }

  // Sort: codes first, then by title
  laws.sort((a, b) => {
    if (a.category === 'code' && b.category !== 'code') return -1;
    if (a.category !== 'code' && b.category === 'code') return 1;
    return a.title.localeCompare(b.title, 'fr');
  });

  // Build summary
  const ingestable = laws.filter(l => l.classification === 'ingestable').length;
  const metadataOnly = laws.filter(l => l.classification === 'metadata_only').length;

  const census: CensusOutput = {
    schema_version: '1.0',
    jurisdiction: 'FR',
    jurisdiction_name: 'France',
    portal: 'https://www.legifrance.gouv.fr',
    census_date: new Date().toISOString().split('T')[0],
    agent: 'census.ts',
    summary: {
      total_laws: laws.length,
      total_provisions: totalArticles,
      ingestable,
      ocr_needed: 0,
      inaccessible: 0,
      excluded: metadataOnly,
    },
    laws,
  };

  // Write census
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CENSUS_PATH, JSON.stringify(census, null, 2), 'utf-8');

  console.log(`\n=== Census Summary ===`);
  console.log(`Total texts: ${laws.length}`);
  console.log(`  Codes: ${laws.filter(l => l.category === 'code').length}`);
  console.log(`  Lois: ${laws.filter(l => l.category === 'loi').length}`);
  console.log(`  Ordonnances: ${laws.filter(l => l.category === 'ordonnance').length}`);
  console.log(`  Decrets: ${laws.filter(l => l.category === 'decret').length}`);
  console.log(`  Other: ${laws.filter(l => l.category === 'other').length}`);
  console.log(`Total article files: ${totalArticles}`);
  console.log(`Ingestable: ${ingestable}`);
  console.log(`Metadata only (no articles): ${metadataOnly}`);
  console.log(`\nWritten: ${CENSUS_PATH}`);
}

/**
 * Find metadata XML files in the text directory.
 * In LEGI archive, these are at texte/version/{ID}.xml
 * The XML wraps its content in a <TEXTE_VERSION> root element.
 */
function findTexteVersionXml(dir: string): string[] {
  const results: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fp = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(fp, depth + 1);
      } else if (
        entry.name.endsWith('.xml') &&
        (entry.name.startsWith('LEGITEXT') || entry.name.startsWith('JORFTEXT'))
      ) {
        results.push(fp);
      }
    }
  };
  walk(dir, 0);
  return results;
}

main().catch(err => {
  console.error('Census failed:', err);
  process.exit(1);
});
