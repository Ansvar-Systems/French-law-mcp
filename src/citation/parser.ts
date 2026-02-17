/**
 * French legal citation parser.
 *
 * Supported examples:
 *   "Code de la défense, art. L. 2321-1"
 *   "Code pénal, article 323-1"
 *   "Article L. 2321-1 du Code de la défense"
 *   "art. 323-1 du Code pénal"
 */

import type { ParsedCitation } from '../types/index.js';

const ARTICLE_TOKEN = '(?:[A-Za-z]\\s*\\.?\\s*)?\\d+(?:-\\d+)*(?:-[A-Za-z0-9]+)*';
const TITLE_THEN_ARTICLE = new RegExp(
  `^(.+?),\\s*(?:article|art\\.?)\\s*(${ARTICLE_TOKEN})\\.?$`,
  'iu',
);
const ARTICLE_THEN_TITLE = new RegExp(
  `^(?:article|art\\.?)\\s*(${ARTICLE_TOKEN})\\s+d(?:e|u)\\s+(.+)$`,
  'iu',
);
const TITLE_ARTICLE_NO_COMMA = new RegExp(
  `^(.+?)\\s+(?:article|art\\.?)\\s*(${ARTICLE_TOKEN})\\.?$`,
  'iu',
);

export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();
  if (!trimmed) {
    return {
      valid: false,
      type: 'unknown',
      error: 'Empty citation',
    };
  }

  const normalized = normalizeInput(trimmed);
  const parsed = tryParsePatterns(normalized);
  if (!parsed) {
    return {
      valid: false,
      type: 'unknown',
      error: `Could not parse French citation: "${trimmed}"`,
    };
  }

  const yearMatch = parsed.title.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return {
    valid: true,
    type: 'statute',
    title: parsed.title,
    year: yearMatch ? Number.parseInt(yearMatch[1], 10) : undefined,
    section: parsed.section,
  };
}

function normalizeInput(value: string): string {
  return value
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(value: string): string {
  return value
    .replace(/[.,;:]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArticleRef(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .toUpperCase();
}

function tryParsePatterns(
  citation: string
): { title: string; section: string } | null {
  const titleFirst = citation.match(TITLE_THEN_ARTICLE);
  if (titleFirst) {
    return {
      title: normalizeTitle(titleFirst[1]),
      section: normalizeArticleRef(titleFirst[2]),
    };
  }

  const articleFirst = citation.match(ARTICLE_THEN_TITLE);
  if (articleFirst) {
    return {
      title: normalizeTitle(articleFirst[2]),
      section: normalizeArticleRef(articleFirst[1]),
    };
  }

  const noComma = citation.match(TITLE_ARTICLE_NO_COMMA);
  if (noComma) {
    return {
      title: normalizeTitle(noComma[1]),
      section: normalizeArticleRef(noComma[2]),
    };
  }

  return null;
}
