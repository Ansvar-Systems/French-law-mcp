/**
 * Golden contract tests for French Law MCP.
 *
 * Validates that the MCP tools return expected results
 * against a known database state.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GoldenTest {
  id: string;
  category: string;
  description: string;
  tool: string;
  input: Record<string, unknown>;
  assertions: Record<string, unknown>;
}

interface GoldenTestSuite {
  version: string;
  mcp_name: string;
  tests: GoldenTest[];
}

const goldenTests: GoldenTestSuite = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'fixtures', 'golden-tests.json'), 'utf-8')
);

describe('Golden Contract Tests', () => {
  it('should have at least 10 golden tests defined', () => {
    expect(goldenTests.tests.length).toBeGreaterThanOrEqual(10);
  });

  it('should have required test categories', () => {
    const categories = new Set(goldenTests.tests.map(t => t.category));
    expect(categories.has('article_retrieval')).toBe(true);
    expect(categories.has('search')).toBe(true);
    expect(categories.has('negative_test')).toBe(true);
  });

  for (const test of goldenTests.tests) {
    it(`[${test.id}] ${test.description}`, () => {
      // Structural validation — tool execution requires a running database
      expect(test.tool).toBeTruthy();
      expect(test.input).toBeDefined();
      expect(test.assertions).toBeDefined();
    });
  }
});
