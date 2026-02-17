import { describe, it, expect } from 'vitest';
import { formatCitation } from '../../src/citation/formatter.js';
import type { ParsedCitation } from '../../src/types/index.js';

describe('formatCitation (French)', () => {
  const parsed: ParsedCitation = {
    valid: true,
    type: 'statute',
    title: 'Code de la défense',
    section: 'L2321-1',
  };

  it('formats full citation', () => {
    expect(formatCitation(parsed, 'full')).toBe('Code de la défense, art. L. 2321-1');
  });

  it('formats short citation', () => {
    expect(formatCitation(parsed, 'short')).toBe('Code de la défense art. L. 2321-1');
  });

  it('formats pinpoint citation', () => {
    expect(formatCitation(parsed, 'pinpoint')).toBe('art. L. 2321-1');
  });

  it('returns empty for invalid parse', () => {
    expect(formatCitation({ valid: false, type: 'unknown' }, 'full')).toBe('');
  });
});
