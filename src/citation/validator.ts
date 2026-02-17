/**
 * French legal citation validator.
 *
 * Validates a citation string against the database to ensure the document
 * and provision actually exist (zero-hallucination enforcement).
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { ValidationResult } from '../types/index.js';
import { parseCitation } from './parser.js';

export function validateCitation(db: Database, citation: string): ValidationResult {
  const parsed = parseCitation(citation);
  const warnings: string[] = [];

  if (!parsed.valid) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [parsed.error ?? 'Invalid citation format'],
    };
  }

  if (!parsed.title) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: ['Citation does not include a recognizable statute title'],
    };
  }

  const docs = db.prepare(
    'SELECT id, title, short_name, status FROM legal_documents'
  ).all() as Array<{
    id: string;
    title: string;
    short_name: string | null;
    status: string;
  }>;

  const target = normalizeLookup(parsed.title);
  let bestDoc:
    | {
        id: string;
        title: string;
        short_name: string | null;
        status: string;
      }
    | undefined;
  let bestScore = -1;

  for (const doc of docs) {
    const candidates = [doc.title, doc.short_name ?? '', doc.id];
    let score = 0;
    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = normalizeLookup(candidate);
      if (!normalized) continue;
      if (normalized === target) {
        score = Math.max(score, 4);
      } else if (normalized.includes(target)) {
        score = Math.max(score, 3);
      } else if (target.includes(normalized)) {
        score = Math.max(score, 2);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestDoc = doc;
    }
  }

  const doc = bestScore > 0 ? bestDoc : undefined;

  if (!doc) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [`Document "${parsed.title}" not found in database`],
    };
  }

  if (doc.status === 'repealed') {
    warnings.push('This statute has been repealed');
  }

  // Check provision existence; if no section is present, a valid document-level citation is acceptable.
  let provisionExists = true;
  if (parsed.section) {
    const sectionCandidates = buildSectionCandidates(parsed.section);
    const provisionRefCandidates = sectionCandidates.map((value) =>
      value.startsWith('ART') ? value.toLowerCase() : `art${value}`.toLowerCase(),
    );

    const sectionPlaceholders = sectionCandidates.map(() => '?').join(', ');
    const provisionRefPlaceholders = provisionRefCandidates.map(() => '?').join(', ');

    const query = `
      SELECT 1
      FROM legal_provisions
      WHERE document_id = ?
        AND (
          upper(replace(section, '.', '')) IN (${sectionPlaceholders})
          OR lower(provision_ref) IN (${provisionRefPlaceholders})
        )
      LIMIT 1
    `;
    const params = [doc.id, ...sectionCandidates, ...provisionRefCandidates];
    const prov = db.prepare(query).get(...params);
    provisionExists = !!prov;

    if (!provisionExists) {
      warnings.push(`Article ${parsed.section} not found in ${doc.title}`);
    }
  }

  return {
    citation: parsed,
    document_exists: true,
    provision_exists: provisionExists,
    document_title: doc.title,
    status: doc.status,
    warnings,
  };
}

function normalizeLookup(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildSectionCandidates(section: string): string[] {
  const normalized = section
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .toUpperCase();

  const withoutArtPrefix = normalized.replace(/^ART/i, '');
  const candidates = new Set<string>([normalized, withoutArtPrefix]);

  const letterMatch = withoutArtPrefix.match(/^([A-Z])(\d.*)$/);
  if (letterMatch) {
    candidates.add(`${letterMatch[1]}${letterMatch[2]}`);
  }

  return [...candidates].filter(Boolean);
}
