# French Law MCP Server

**The Legifrance alternative for the AI age.**

[![npm version](https://badge.fury.io/js/%40ansvar/french-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/french-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/French-law-mcp?style=social)](https://github.com/Ansvar-Systems/French-law-mcp)
[![CI](https://github.com/Ansvar-Systems/French-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/French-law-mcp/actions/workflows/ci.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)]()
[![Provisions](https://img.shields.io/badge/provisions-193%2C681-blue)]()

Query **3,953 French laws** -- from the Loi Informatique et Libertes and Code penal to the Code de commerce, Code civil, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing French legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

French legal research is scattered across Legifrance, the Journal Officiel, and commercial platforms like Dalloz and LexisNexis. Whether you're:
- A **lawyer** validating citations in a brief or contract under French law
- A **compliance officer** checking RGPD implementation under the Loi Informatique et Libertes
- A **legal tech developer** building tools on French legislation
- A **researcher** tracing legislative history from the Code Napoleon to modern codes

...you shouldn't need dozens of browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes French law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://french-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add french-law --transport http https://french-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "french-law": {
      "type": "url",
      "url": "https://french-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "french-law": {
      "type": "http",
      "url": "https://french-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/french-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "french-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/french-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "french-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/french-law-mcp"]
    }
  }
}
```

---

## Example Queries

Once connected, just ask naturally:

- *"Que dit la Loi Informatique et Libertes sur le consentement ?"*
- *"Rechercher les dispositions sur les donnees personnelles dans le droit francais"*
- *"Le Code de commerce est-il toujours en vigueur ?"*
- *"Quelles directives europeennes la loi francaise transpose-t-elle ?"*
- *"What does the French Penal Code say about cybercrime?"*
- *"Find provisions about data breach notification in French law"*
- *"Validate this legal citation"*
- *"Build a legal stance on RGPD implementation in France"*

---

## Available Tools (12)

- `search_legislation` -- FTS5 full-text search across all provisions with BM25 ranking
- `get_provision` -- Retrieve specific provision by statute + article
- `validate_citation` -- Validate citation against database (zero-hallucination check)
- `format_citation` -- Format citations per French conventions (full/short/pinpoint)
- `build_legal_stance` -- Aggregate citations from statutes for a legal topic
- `check_currency` -- Check if statute is in force, amended, or repealed
- `get_eu_basis` -- Get EU directives/regulations for French statute
- `get_french_implementations` -- Find French laws implementing EU act
- `search_eu_implementations` -- Search EU documents with French implementation counts
- `get_provision_eu_basis` -- Get EU law references for specific provision
- `validate_eu_compliance` -- Check implementation status of EU directives
- `about` -- Server info, capabilities, and coverage summary

---

## Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from official Legifrance/DILA open data sources
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains regulation text, not AI interpretations

**Technical Architecture:**
```
LEGI Archive --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                  ^                       ^
           Provision parser         Verbatim database query
```

---

## Data Sources & Freshness

All content is sourced from authoritative French legal databases:

- **[Legifrance](https://www.legifrance.gouv.fr)** -- Official French government legal database (DILA open data)
- **[EUR-Lex](https://eur-lex.europa.eu/)** -- Official EU law database (metadata only)

**Verified data only** -- every citation is validated against official sources. Zero LLM-generated content.

### Automated Freshness Checks

- `check-updates.yml` runs daily and checks for newer LEGI archive publication timestamps
- Opens/updates `data-update` issues when updates or errors are detected
- Supports `auto_update=true` dispatch for automated ingest, rebuild, validate, and commit/tag

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official Legifrance/DILA publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is limited** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources for court filings
> - **EU cross-references** are extracted from statute text, not EUR-Lex full text

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [SECURITY.md](SECURITY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/French-law-mcp
cd French-law-mcp
npm install
npm run build
npm test
```

### Development Commands

```bash
npm run dev              # Run stdio MCP server from source
npm run start            # Run built stdio MCP server
npm test                 # Unit/integration + contract tests
npm run test:mcp         # Protocol-level MCP output envelope test
npm run test:contract    # Golden contract suite
npm run build:db         # Build SQLite DB from seeds
npm run ingest:legi      # Ingest from LEGI archive into seeds
npm run check-updates    # Check source freshness (LEGI archive delta)
npm run drift:detect     # Detect upstream hash drift from anchors
npm run validate         # test + contract
```

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npx @ansvar/us-regulations-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** -- ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

**70+ national law MCPs** covering Australia, Belgium, Brazil, Canada, China, Denmark, Finland, Germany, Ghana, Iceland, India, Ireland, Israel, Italy, Japan, Kenya, Netherlands, Nigeria, Norway, Singapore, Slovenia, South Korea, Spain, Sweden, Switzerland, Thailand, UAE, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law expansion
- EU cross-reference improvements
- Historical statute versions and amendment tracking
- Additional codes and regulatory instruments

---

## Roadmap

- [x] Core statute database with FTS5 search
- [x] EU/international law cross-references
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [x] Full corpus ingestion (3,953 laws, 193,681 provisions)
- [ ] Court case law expansion
- [ ] Historical statute versions (amendment tracking)
- [ ] Travaux preparatoires integration

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{french_law_mcp_2025,
  author = {Ansvar Systems AB},
  title = {French Law MCP Server: AI-Powered Legal Research Tool},
  year = {2025},
  url = {https://github.com/Ansvar-Systems/French-law-mcp},
  note = {French legal database with 3,953 laws and EU cross-references}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** French Government / DILA (Licence Ouverte / Open Licence)
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the global market. This MCP server started as our internal reference tool -- turns out everyone building compliance tools has the same research frustrations.

So we're open-sourcing it. Navigating 3,953 laws shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
