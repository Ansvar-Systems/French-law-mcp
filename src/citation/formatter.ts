/**
 * UK legal citation formatter.
 *
 * Formats:
 *   full:     "Section 3, Data Protection Act 2018"
 *   short:    "s. 3 DPA 2018"
 *   pinpoint: "s. 3(1)(a)"
 */

import type { ParsedCitation, CitationFormat } from '../types/index.js';

export function formatCitation(
  parsed: ParsedCitation,
  format: CitationFormat = 'full'
): string {
  if (!parsed.valid || !parsed.section) {
    return '';
  }

  const pinpoint = buildPinpoint(parsed);

  switch (format) {
    case 'full':
      return `Section ${pinpoint}, ${parsed.title ?? ''} ${parsed.year ?? ''}`.trim();

    case 'short':
      return `s. ${pinpoint} ${parsed.title ?? ''} ${parsed.year ?? ''}`.trim();

    case 'pinpoint':
      return `s. ${pinpoint}`;

    default:
      return `Section ${pinpoint}, ${parsed.title ?? ''} ${parsed.year ?? ''}`.trim();
  }
}

function buildPinpoint(parsed: ParsedCitation): string {
  let ref = parsed.section ?? '';
  if (parsed.subsection) {
    ref += `(${parsed.subsection})`;
  }
  if (parsed.paragraph) {
    ref += `(${parsed.paragraph})`;
  }
  return ref;
}
