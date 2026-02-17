import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateCitation } from '../../src/citation/validator.js';
import { openReadonlyDatabase, closeDatabase } from '../fixtures/db.js';

let db: ReturnType<typeof openReadonlyDatabase>;

describe('validateCitation (French)', () => {
  beforeAll(() => {
    db = openReadonlyDatabase();
  });

  afterAll(() => {
    closeDatabase(db);
  });

  it('validates an existing citation with accent-insensitive title matching', () => {
    const result = validateCitation(db, 'Code de la defense, art. L. 2321-1');
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('reports missing provision in an existing statute', () => {
    const result = validateCitation(db, 'Code pénal, art. 999-999');
    expect(result.document_exists).toBe(true);
    expect(result.provision_exists).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('not found'))).toBe(true);
  });

  it('reports missing document', () => {
    const result = validateCitation(db, 'Code imaginaire, art. 1');
    expect(result.document_exists).toBe(false);
    expect(result.provision_exists).toBe(false);
  });
});
