import { describe, it, expect } from 'vitest';
import { parseCitation } from '../../src/citation/parser.js';

describe('parseCitation (French)', () => {
  it('parses title-first citation with comma', () => {
    const parsed = parseCitation('Code de la défense, art. L. 2321-1');
    expect(parsed.valid).toBe(true);
    expect(parsed.type).toBe('statute');
    expect(parsed.title).toBe('Code de la défense');
    expect(parsed.section).toBe('L2321-1');
  });

  it('parses article-first citation', () => {
    const parsed = parseCitation('Article L. 2321-1 du Code de la défense');
    expect(parsed.valid).toBe(true);
    expect(parsed.title).toBe('Code de la défense');
    expect(parsed.section).toBe('L2321-1');
  });

  it('parses numeric article citations', () => {
    const parsed = parseCitation('Code pénal, article 323-1');
    expect(parsed.valid).toBe(true);
    expect(parsed.title).toBe('Code pénal');
    expect(parsed.section).toBe('323-1');
  });

  it('returns invalid for unknown format', () => {
    const parsed = parseCitation('random free text');
    expect(parsed.valid).toBe(false);
    expect(parsed.error).toContain('Could not parse French citation');
  });
});
