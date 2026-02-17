import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { openReadonlyDatabase, closeDatabase } from '../fixtures/db.js';

let db: ReturnType<typeof openReadonlyDatabase>;

describe('validate_citation tool', () => {
  beforeAll(() => {
    db = openReadonlyDatabase();
  });

  afterAll(() => {
    closeDatabase(db);
  });

  it('returns valid=true for a known French citation', async () => {
    const response = await validateCitationTool(db, {
      citation: 'Code de la défense, art. L. 2321-1',
    });

    expect(response.results.valid).toBe(true);
    expect(response.results.document_exists).toBe(true);
    expect(response.results.provision_exists).toBe(true);
    expect(response.results.formatted_citation).toContain('L. 2321-1');
  });

  it('handles invalid citation format', async () => {
    const response = await validateCitationTool(db, {
      citation: 'this is not a legal citation',
    });

    expect(response.results.valid).toBe(false);
    expect(response.results.document_exists).toBe(false);
  });
});
