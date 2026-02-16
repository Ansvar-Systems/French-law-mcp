/**
 * FTS5 query builder for French Law MCP.
 */

const EXPLICIT_FTS_SYNTAX = /["""]|(\bAND\b)|(\bOR\b)|(\bNOT\b)|\*$/;

export interface FtsQueryVariants {
  primary: string;
  fallback?: string;
}

export function buildFtsQueryVariants(query: string): FtsQueryVariants {
  const trimmed = query.trim();

  if (EXPLICIT_FTS_SYNTAX.test(trimmed)) {
    return { primary: trimmed };
  }

  const tokens = trimmed
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => t.replace(/[^\w\s-]/g, ''));

  if (tokens.length === 0) {
    return { primary: trimmed };
  }

  const primary = tokens.map(t => `"${t}"*`).join(' ');
  const fallback = tokens.map(t => `${t}*`).join(' OR ');

  return { primary, fallback };
}
