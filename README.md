# French Law MCP Server

Production-focused [Model Context Protocol](https://modelcontextprotocol.io) server for French legislation, with:

- FTS5 search over seeded French legal provisions
- Citation validation/formatting for French article references
- EU directive/regulation cross-reference tools
- Contract golden tests, drift detection, and scheduled update checks
- Vercel deployment support for Streamable HTTP MCP

## Quick Start

### Local

```bash
npm install
npm run build
npm run dev
```

### Package execution

```bash
npx @ansvar/french-law-mcp
```

### Remote MCP endpoint (Vercel)

If deployed, connect clients to:

```text
https://<your-vercel-domain>/mcp
```

Health/version endpoints:

- `https://<your-vercel-domain>/health`
- `https://<your-vercel-domain>/version`

## Available Tools

- `search_legislation`
- `get_provision`
- `validate_citation`
- `format_citation`
- `build_legal_stance`
- `check_currency`
- `get_eu_basis`
- `get_french_implementations`
- `search_eu_implementations`
- `get_provision_eu_basis`
- `validate_eu_compliance`
- `about` (enabled in stdio runtime with context)

## Data and Sources

- Primary legal source: Legifrance open data (DILA)
- EU references: EUR-Lex metadata linkage
- Seed files: `data/seed/*.json`
- Built database: `data/database.db`
- Source metadata: `sources.yml`

## Development Commands

```bash
npm run build            # TypeScript build
npm run dev              # Run stdio MCP server from source
npm run start            # Run built stdio MCP server
npm test                 # Unit/integration + contract tests
npm run test:mcp         # Protocol-level MCP output envelope test
npm run test:contract    # Golden contract suite
npm run test:coverage    # Coverage output
npm run build:db         # Build SQLite DB from seeds
npm run ingest:legi      # Ingest from LEGI archive into seeds
npm run check-updates    # Check source freshness (LEGI archive delta)
npm run drift:detect     # Detect upstream hash drift from anchors
npm run validate         # test + contract
```

## Golden Tests and Drift

### Contract golden tests

- Test file: `__tests__/contract/golden.test.ts`
- Fixture: `fixtures/golden-tests.json`
- Nightly mode: `CONTRACT_MODE=nightly npm run test:contract`

### Drift detection

- Script: `scripts/drift-detect.ts`
- Fixture: `fixtures/golden-hashes.json`
- Hash anchors use `COMPUTE_ON_FIRST_RUN` until initialized

## Automation Workflows

GitHub workflows included:

- `.github/workflows/ci.yml`
- `.github/workflows/check-updates.yml`
- `.github/workflows/drift-detect.yml`
- `.github/workflows/vercel-deploy.yml`

### Update automation

`check-updates.yml` runs daily and:

- checks for newer LEGI archive publication timestamps
- opens/updates `data-update` issues when updates/errors are detected
- supports manual `auto_update=true` dispatch to ingest, rebuild, validate, and commit/tag

## Vercel Deployment

Vercel runtime entrypoints:

- `api/mcp.ts` (Streamable MCP HTTP transport)
- `api/health.ts` (`/health` and `/version`)

Required repository secrets for `vercel-deploy.yml`:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Runtime config is defined in `vercel.json`.

## Notes

- This project is a legal research tool, not legal advice.
- Always verify critical citations against official publications.
