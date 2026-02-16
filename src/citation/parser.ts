/**
 * UK legal citation parser.
 *
 * Parses citations like:
 *   "Section 3, Data Protection Act 2018"
 *   "s. 3 DPA 2018"
 *   "s. 3(1)(a) Data Protection Act 2018"
 */

import type { ParsedCitation } from '../types/index.js';

// Full citation: "Section 3, Data Protection Act 2018"
const FULL_CITATION = /^(?:Section|s\.?)\s+(\d+(?:\(\d+\))*(?:\([a-z]\))*)\s*,?\s+(.+?)\s+(\d{4})$/i;

// Short citation: "s. 3 DPA 2018"
const SHORT_CITATION = /^s\.?\s+(\d+(?:\(\d+\))*(?:\([a-z]\))*)\s+([A-Z][A-Z0-9&\s]*?)\s+(\d{4})$/;

// Section with subsection: "s. 3(1)(a)"
const SECTION_REF = /^(\d+)(?:\((\d+)\))?(?:\(([a-z])\))?$/;

export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();

  let match = trimmed.match(FULL_CITATION);
  if (match) {
    return parseSection(match[1], match[2], parseInt(match[3], 10), 'statute');
  }

  match = trimmed.match(SHORT_CITATION);
  if (match) {
    return parseSection(match[1], match[2], parseInt(match[3], 10), 'statute');
  }

  return {
    valid: false,
    type: 'unknown',
    error: `Could not parse UK citation: "${trimmed}"`,
  };
}

function parseSection(
  sectionStr: string,
  title: string,
  year: number,
  type: 'statute' | 'statutory_instrument'
): ParsedCitation {
  const sectionMatch = sectionStr.match(SECTION_REF);
  if (!sectionMatch) {
    return {
      valid: true,
      type,
      title: title.trim(),
      year,
      section: sectionStr,
    };
  }

  return {
    valid: true,
    type,
    title: title.trim(),
    year,
    section: sectionMatch[1],
    subsection: sectionMatch[2] || undefined,
    paragraph: sectionMatch[3] || undefined,
  };
}
