#!/usr/bin/env tsx
/**
 * LEGI XML Archive Ingestion for French Law MCP.
 *
 * Downloads the DILA LEGI open data archive and extracts articles
 * for configured French codes. Produces seed JSON files in data/seed/.
 *
 * Data source: https://echanges.dila.gouv.fr/OPENDATA/LEGI/
 *
 * Usage:
 *   npm run ingest:legi                        # Full ingestion from LEGI archive
 *   npm run ingest:legi -- --archive /path.tgz # Use existing local archive
 *   npm run ingest:legi -- --extracted /path    # Use already-extracted directory
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { parseLegiXml } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const ARCHIVE_URL = 'https://echanges.dila.gouv.fr/OPENDATA/LEGI/Freemium_legi_global_20250713-140000.tar.gz';

// ---------------------------------------------------------------------------
// Target codes
// ---------------------------------------------------------------------------

interface TargetCode {
  textId: string;
  /** JORFTEXT parent (for standalone laws stored as TNC) */
  jorfTextId?: string;
  documentId: string;
  title: string;
  titleEn: string;
  shortName: string;
  url: string;
  description: string;
}

const TARGET_CODES: TargetCode[] = [
  {
    textId: 'LEGITEXT000006070719',
    documentId: 'code-penal',
    title: 'Code pénal',
    titleEn: 'French Criminal Code',
    shortName: 'Code pénal',
    url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070719/',
    description: 'The French Criminal Code, including cybercrime provisions (Articles 323-1 to 323-8).',
  },
  {
    textId: 'LEGITEXT000006068624',
    jorfTextId: 'JORFTEXT000000886460',
    documentId: 'loi-informatique-libertes',
    title: "Loi n° 78-17 du 6 janvier 1978 relative à l'informatique, aux fichiers et aux libertés",
    titleEn: 'Data Protection Act (Loi Informatique et Libertés)',
    shortName: 'Loi Informatique et Libertés',
    url: 'https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000886460/',
    description: "France's foundational data protection law, amended to implement the GDPR.",
  },
  {
    textId: 'LEGITEXT000006071307',
    documentId: 'code-defense',
    title: 'Code de la défense',
    titleEn: 'Defence Code',
    shortName: 'Code de la défense',
    url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006071307/',
    description: 'French Defence Code: ANSSI mandate, OIV protection, cybersecurity provisions.',
  },
  {
    textId: 'LEGITEXT000006070987',
    documentId: 'code-postes-telecom',
    title: 'Code des postes et des communications électroniques',
    titleEn: 'Postal and Electronic Communications Code',
    shortName: 'CPCE',
    url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070987/',
    description: 'Electronic communications regulation, security obligations, data retention.',
  },
  {
    textId: 'LEGITEXT000025503132',
    documentId: 'code-securite-interieure',
    title: 'Code de la sécurité intérieure',
    titleEn: 'Internal Security Code',
    shortName: 'CSI',
    url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000025503132/',
    description: 'Intelligence oversight, surveillance, cybersecurity incident response.',
  },
  {
    textId: 'LEGITEXT000005634379',
    documentId: 'code-commerce',
    title: 'Code de commerce',
    titleEn: 'Commercial Code',
    shortName: 'Code de commerce',
    url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000005634379/',
    description: 'Business continuity, trade secret protection, digital commerce.',
  },
  {
    textId: 'LEGITEXT000006070721',
    documentId: 'code-civil',
    title: 'Code civil',
    titleEn: 'French Civil Code',
    shortName: 'Code civil',
    url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721/',
    description: 'Contract law, liability, digital rights.',
  },
  {
    textId: 'LEGITEXT000006072050',
    documentId: 'code-travail',
    title: 'Code du travail',
    titleEn: 'Labour Code',
    shortName: 'Code du travail',
    url: 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006072050/',
    description: 'Employee data protection, remote work, whistleblower protection.',
  },
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): { archive?: string; extracted?: string } {
  const args = process.argv.slice(2);
  let archive: string | undefined;
  let extracted: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--archive' && args[i + 1]) { archive = args[i + 1]; i++; }
    else if (args[i] === '--extracted' && args[i + 1]) { extracted = args[i + 1]; i++; }
  }
  return { archive, extracted };
}

// ---------------------------------------------------------------------------
// Step 1: Build file index from archive (one tar listing)
// ---------------------------------------------------------------------------

function buildFileIndex(archivePath: string): string[] {
  console.log('Building filtered archive index (tar tzf | grep)...');
  const indexFile = '/tmp/legi_filtered_index.txt';

  // Cache the filtered index
  if (fs.existsSync(indexFile) && fs.statSync(indexFile).size > 100) {
    console.log('  Using cached filtered index.');
    return fs.readFileSync(indexFile, 'utf-8').split('\n').filter(Boolean);
  }

  // Build a grep pattern matching only our target LEGITEXT/JORFTEXT IDs
  const ids = TARGET_CODES.flatMap(c =>
    c.jorfTextId ? [c.textId, c.jorfTextId] : [c.textId]
  );
  const grepPattern = ids.join('|');

  // Pipe tar listing through grep to avoid loading 1.5M lines into Node.js memory
  // tar tzf archive | grep -E 'ID1|ID2|...' > filtered_index
  const result = spawnSync('bash', [
    '-c',
    `tar tzf "${archivePath}" | grep -E '${grepPattern}' | grep '/article/' | grep '\\.xml$'`,
  ], {
    encoding: 'utf-8',
    maxBuffer: 200 * 1024 * 1024, // 200MB — filtered output is much smaller
    timeout: 600_000,
  });

  if (result.error) throw result.error;
  const lines = (result.stdout ?? '').split('\n').filter(Boolean);
  fs.writeFileSync(indexFile, lines.join('\n'), 'utf-8');
  console.log(`  Found ${lines.length} article files matching target codes.`);
  return lines;
}

// ---------------------------------------------------------------------------
// Step 2: Extract target files from archive
// ---------------------------------------------------------------------------

function extractFullArchive(archivePath: string, extractDir: string): void {
  fs.mkdirSync(extractDir, { recursive: true });

  console.log(`  Extracting full archive to ${extractDir} (single decompression)...`);
  console.log('  This extracts ~10GB, takes 2-5 min...');

  // Use spawn (not spawnSync) via execFileSync with generous timeout
  // Extract everything in one pass — much faster than selective extraction
  execFileSync('tar', ['xzf', archivePath, '-C', extractDir], {
    timeout: 1_200_000, // 20 min
    maxBuffer: 50 * 1024 * 1024,
    stdio: 'inherit',
  });

  console.log('  Full extraction complete.');
}

// ---------------------------------------------------------------------------
// Step 3: Parse extracted articles
// ---------------------------------------------------------------------------

interface ParsedLaw {
  documentId: string;
  title: string;
  titleEn: string;
  shortName: string;
  url: string;
  description: string;
  provisions: Array<{
    provision_ref: string;
    chapter?: string;
    section: string;
    title: string;
    content: string;
  }>;
}

function walkXmlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const walk = (d: string) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fp = path.join(d, entry.name);
      if (entry.isDirectory()) walk(fp);
      else if (entry.name.endsWith('.xml') && entry.name.startsWith('LEGIARTI')) results.push(fp);
    }
  };
  walk(dir);
  return results;
}

function parseExtractedCode(extractDir: string, _code: TargetCode): ParsedLaw {
  console.log(`\n--- Parsing: ${_code.shortName} ---`);

  // Find all article XML files under the extraction
  const articleFiles = walkXmlFiles(extractDir);
  console.log(`  Article XML files: ${articleFiles.length}`);

  const provisions: ParsedLaw['provisions'] = [];
  let parsed = 0;
  let skipped = 0;

  for (const xmlFile of articleFiles) {
    try {
      const xmlContent = fs.readFileSync(xmlFile, 'utf-8');
      const result = parseLegiXml(xmlContent);

      for (const article of result.articles) {
        if (article.content.trim().length === 0) continue;
        provisions.push({
          provision_ref: `art${article.normalizedNum}`,
          section: article.normalizedNum,
          title: article.title,
          content: article.content,
        });
        parsed++;
      }
      skipped += result.articles.length === 0 ? 1 : 0;
    } catch {
      skipped++;
    }
  }

  // Deduplicate by provision_ref (keep longest content)
  const byRef = new Map<string, (typeof provisions)[0]>();
  for (const prov of provisions) {
    const existing = byRef.get(prov.provision_ref);
    if (!existing || prov.content.length > existing.content.length) {
      byRef.set(prov.provision_ref, prov);
    }
  }
  const deduped = Array.from(byRef.values());
  deduped.sort((a, b) => a.provision_ref.localeCompare(b.provision_ref, 'fr', { numeric: true }));

  console.log(`  Parsed: ${parsed}, Skipped (not in-force/empty): ${skipped}`);
  console.log(`  Unique in-force provisions: ${deduped.length}`);

  return {
    documentId: _code.documentId,
    title: _code.title,
    titleEn: _code.titleEn,
    shortName: _code.shortName,
    url: _code.url,
    description: _code.description,
    provisions: deduped,
  };
}

// ---------------------------------------------------------------------------
// Seed + EU refs + manual seeds
// ---------------------------------------------------------------------------

function writeSeed(law: ParsedLaw): void {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  const seed = {
    id: law.documentId,
    type: 'statute',
    title: law.title,
    title_en: law.titleEn,
    short_name: law.shortName,
    status: 'in_force',
    url: law.url,
    description: law.description,
    provisions: law.provisions,
  };
  const fp = path.join(SEED_DIR, `${law.documentId}.json`);
  fs.writeFileSync(fp, JSON.stringify(seed, null, 2), 'utf-8');
  console.log(`  Wrote ${fp} (${law.provisions.length} provisions)`);
}

function writeEuReferences(): void {
  const euData = {
    eu_documents: [
      { id: 'regulation:2016/679', type: 'regulation', year: 2016, number: 679, community: 'EU', celex_number: '32016R0679', title: 'GDPR', short_name: 'GDPR', url_eur_lex: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj', in_force: true },
      { id: 'directive:2022/2555', type: 'directive', year: 2022, number: 2555, community: 'EU', celex_number: '32022L2555', title: 'NIS 2 Directive', short_name: 'NIS 2', url_eur_lex: 'https://eur-lex.europa.eu/eli/dir/2022/2555', in_force: true },
      { id: 'directive:2016/1148', type: 'directive', year: 2016, number: 1148, community: 'EU', celex_number: '32016L1148', title: 'NIS 1 Directive', short_name: 'NIS 1', url_eur_lex: 'https://eur-lex.europa.eu/eli/dir/2016/1148', in_force: false },
      { id: 'directive:2013/40', type: 'directive', year: 2013, number: 40, community: 'EU', celex_number: '32013L0040', title: 'Cybercrime Directive', short_name: 'Cybercrime Directive', url_eur_lex: 'https://eur-lex.europa.eu/eli/dir/2013/40', in_force: true },
      { id: 'regulation:2019/881', type: 'regulation', year: 2019, number: 881, community: 'EU', celex_number: '32019R0881', title: 'Cybersecurity Act', short_name: 'Cybersecurity Act', url_eur_lex: 'https://eur-lex.europa.eu/eli/reg/2019/881', in_force: true },
    ],
    eu_references: [
      { source_type: 'document', source_id: 'code-penal', document_id: 'code-penal', eu_document_id: 'directive:2013/40', reference_type: 'implements', is_primary_implementation: true, implementation_status: 'complete', reference_context: 'Articles 323-1 to 323-7 implement the Cybercrime Directive.' },
      { source_type: 'document', source_id: 'loi-informatique-libertes', document_id: 'loi-informatique-libertes', eu_document_id: 'regulation:2016/679', reference_type: 'supplements', is_primary_implementation: true, implementation_status: 'complete', reference_context: 'Amended in 2018 to supplement the GDPR.' },
      { source_type: 'document', source_id: 'code-defense', document_id: 'code-defense', eu_document_id: 'directive:2016/1148', reference_type: 'implements', is_primary_implementation: true, implementation_status: 'complete', reference_context: 'OIV framework predates and exceeds NIS 1 requirements.' },
    ],
  };
  const fp = path.join(SEED_DIR, 'eu-references.json');
  fs.writeFileSync(fp, JSON.stringify(euData, null, 2), 'utf-8');
  console.log(`\nWrote EU references: ${fp}`);
}

function writeManualSeeds(): void {
  const seeds = [
    {
      id: 'loi-programmation-militaire-cyber', type: 'statute',
      title: "Loi n° 2023-703 du 1er août 2023 relative à la programmation militaire 2024-2030",
      title_en: 'Military Programming Law 2024-2030 (cyber provisions)',
      short_name: 'LPM 2024-2030 (cyber)', status: 'in_force',
      issued_date: '2023-08-01', in_force_date: '2023-08-02',
      url: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047914986',
      description: 'Expands ANSSI powers for cyber threat detection and response.',
      provisions: [
        { provision_ref: 'art64', chapter: 'Chapitre V', section: '64', title: 'Article 64 - ANSSI DNS threat blocking', content: "Lorsqu'il est constaté qu'une menace susceptible de porter atteinte à la sécurité nationale résulte de l'exploitation d'un nom de domaine, l'autorité nationale en matière de sécurité des systèmes d'information peut demander à toute personne concourant à l'adressage par noms de domaine sur internet de prendre les mesures les plus adaptées pour neutraliser cette menace." },
        { provision_ref: 'art65', chapter: 'Chapitre V', section: '65', title: 'Article 65 - Extended data collection for ANSSI', content: "Pour les besoins de la sécurité des systèmes d'information, l'autorité nationale en matière de sécurité des systèmes d'information peut mettre en oeuvre des dispositifs mettant en oeuvre des marqueurs techniques aux seules fins de détecter des événements susceptibles d'affecter la sécurité des systèmes d'information." },
        { provision_ref: 'art66', chapter: 'Chapitre V', section: '66', title: 'Article 66 - Vulnerability disclosure coordination', content: "L'autorité nationale en matière de sécurité des systèmes d'information peut imposer aux opérateurs de communications électroniques la mise en oeuvre de mesures de filtrage de noms de domaine utilisées par un attaquant." },
      ],
    },
    {
      id: 'nis2-transposition-france', type: 'statute',
      title: 'Cadre de transposition de la directive NIS 2 en droit français',
      title_en: 'Framework for NIS 2 Directive transposition into French law',
      short_name: 'NIS 2 FR transposition', status: 'not_yet_in_force',
      url: 'https://cyber.gouv.fr/la-directive-nis-2',
      description: "France's transposition of NIS 2 Directive.",
      provisions: [
        { provision_ref: 'art-scope', section: 'scope', title: 'Scope - Essential and Important Entities', content: "La transposition NIS 2 distingue les 'entités essentielles' (EE) et les 'entités importantes' (EI)." },
        { provision_ref: 'art-notification', section: 'notification', title: "Notification d'incidents", content: "Alerte précoce dans les 24h, notification complète dans les 72h, rapport final dans un mois." },
        { provision_ref: 'art-measures', section: 'measures', title: 'Mesures de gestion des risques', content: "Mesures techniques, opérationnelles et organisationnelles appropriées." },
        { provision_ref: 'art-sanctions', section: 'sanctions', title: 'Sanctions', content: "EE: jusqu'à 10M EUR ou 2% CA. EI: 7M EUR ou 1,4% CA." },
      ],
    },
  ];
  for (const seed of seeds) {
    const fp = path.join(SEED_DIR, `${seed.id}.json`);
    fs.writeFileSync(fp, JSON.stringify(seed, null, 2), 'utf-8');
    console.log(`Wrote manual seed: ${fp} (${seed.provisions.length} provisions)`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { archive, extracted } = parseArgs();

  console.log('=== French Law MCP — LEGI Archive Ingestion ===\n');

  if (extracted) {
    // Skip extraction, use pre-extracted directory
    console.log(`Using pre-extracted directory: ${extracted}`);
    runParsing(extracted);
    return;
  }

  const archivePath = archive ?? '/tmp/legi_global.tar.gz';

  if (!fs.existsSync(archivePath)) {
    console.log(`Downloading LEGI archive...`);
    execFileSync('curl', ['-fSL', '--progress-bar', '-o', archivePath, ARCHIVE_URL], {
      stdio: 'inherit',
      timeout: 900_000,
    });
  }

  const size = fs.statSync(archivePath).size;
  console.log(`Archive: ${archivePath} (${(size / 1024 / 1024).toFixed(0)}MB)\n`);

  // Step 1: Extract full archive (single decompression — fastest approach)
  const extractDir = '/tmp/legi_extracted';
  if (!fs.existsSync(path.join(extractDir, 'legi'))) {
    if (fs.existsSync(extractDir)) {
      execFileSync('rm', ['-rf', extractDir]);
    }
    extractFullArchive(archivePath, extractDir);
  } else {
    console.log(`Using previously extracted archive at ${extractDir}`);
  }

  // Step 2: Parse each code
  runParsing(extractDir);
}

/**
 * Compute the LEGI archive path from a LEGITEXT/JORFTEXT ID.
 * LEGI archive structure: legi/global/code_et_TNC_en_vigueur/{code_en_vigueur|TNC_en_vigueur}/{LEGI|JORF}/TEXT/XX/XX/XX/XX/XX/ID
 * where XX pairs are derived from the first 10 digits of the numeric part.
 */
function legiIdToPath(id: string): string {
  const digits = id.replace(/^(LEGITEXT|JORFTEXT)/, '');
  const pairs = [];
  for (let i = 0; i < 10; i += 2) {
    pairs.push(digits.slice(i, i + 2));
  }
  const pathPairs = pairs.join('/');

  if (id.startsWith('LEGITEXT')) {
    return `legi/global/code_et_TNC_en_vigueur/code_en_vigueur/LEGI/TEXT/${pathPairs}/${id}`;
  } else {
    return `legi/global/code_et_TNC_en_vigueur/TNC_en_vigueur/JORF/TEXT/${pathPairs}/${id}`;
  }
}

function runParsing(extractDir: string): void {
  const results: Array<{ id: string; provisions: number }> = [];

  for (const code of TARGET_CODES) {
    // Compute directory path directly (avoids slow `find` on 14GB archive)
    const searchId = code.jorfTextId ?? code.textId;
    const codeDir = path.join(extractDir, legiIdToPath(searchId));

    const law = parseExtractedCode(codeDir, code);
    if (law.provisions.length > 0) {
      writeSeed(law);
      results.push({ id: law.documentId, provisions: law.provisions.length });
    } else {
      console.log(`  WARNING: No provisions found for ${code.shortName}`);
    }
  }

  // Write EU references and manual seeds
  writeEuReferences();
  writeManualSeeds();

  // Summary
  console.log('\n=== Ingestion Summary ===');
  let total = 0;
  for (const r of results) {
    console.log(`  ${r.id}: ${r.provisions} provisions`);
    total += r.provisions;
  }
  console.log(`\nTotal: ${results.length} codes, ${total} provisions from LEGI archive`);
  console.log('+ 2 manual seeds (LPM 2024-2030 cyber, NIS 2 transposition)');
  console.log('\nNext step: npm run build:db');
}

main().catch(err => {
  console.error('LEGI ingestion failed:', err);
  process.exit(1);
});
