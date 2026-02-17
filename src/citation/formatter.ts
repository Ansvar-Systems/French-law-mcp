/**
 * French legal citation formatter.
 *
 * Formats:
 *   full:     "Code de la défense, art. L. 2321-1"
 *   short:    "Code de la défense art. L. 2321-1"
 *   pinpoint: "art. L. 2321-1"
 */

import type { ParsedCitation, CitationFormat } from '../types/index.js';

export function formatCitation(
  parsed: ParsedCitation,
  format: CitationFormat = 'full'
): string {
  if (!parsed.valid || !parsed.section) {
    return '';
  }

  const article = buildArticleRef(parsed.section);

  switch (format) {
    case 'full':
      if (parsed.title) {
        return `${parsed.title}, art. ${article}`;
      }
      return `art. ${article}`;

    case 'short':
      if (parsed.title) {
        return `${parsed.title} art. ${article}`;
      }
      return `art. ${article}`;

    case 'pinpoint':
      return `art. ${article}`;

    default:
      if (parsed.title) {
        return `${parsed.title}, art. ${article}`;
      }
      return `art. ${article}`;
  }
}

function buildArticleRef(section: string): string {
  const normalized = section.replace(/\s+/g, '').replace(/\./g, '').toUpperCase();
  const prefixed = normalized.match(/^([A-Z])(\d.*)$/);
  if (prefixed) {
    return `${prefixed[1]}. ${prefixed[2]}`;
  }
  return normalized;
}
