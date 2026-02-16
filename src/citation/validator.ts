/**
 * UK legal citation validator.
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

  // Look up document by title match
  const doc = db.prepare(
    "SELECT id, title, status FROM legal_documents WHERE title LIKE ? LIMIT 1"
  ).get(`%${parsed.title}%${parsed.year ?? ''}%`) as { id: string; title: string; status: string } | undefined;

  if (!doc) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [`Document "${parsed.title} ${parsed.year}" not found in database`],
    };
  }

  if (doc.status === 'repealed') {
    warnings.push('This statute has been repealed');
  }

  // Check provision existence
  let provisionExists = false;
  if (parsed.section) {
    const prov = db.prepare(
      "SELECT 1 FROM legal_provisions WHERE document_id = ? AND section = ?"
    ).get(doc.id, parsed.section);
    provisionExists = !!prov;

    if (!provisionExists) {
      warnings.push(`Section ${parsed.section} not found in ${doc.title}`);
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
