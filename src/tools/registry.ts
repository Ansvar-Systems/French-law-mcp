/**
 * Tool registry for French Law MCP Server.
 * Shared between stdio (index.ts) and HTTP (api/mcp.ts) entry points.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';

import { searchLegislation, SearchLegislationInput } from './search-legislation.js';
import { getProvision, GetProvisionInput } from './get-provision.js';
import { validateCitationTool, ValidateCitationInput } from './validate-citation.js';
import { buildLegalStance, BuildLegalStanceInput } from './build-legal-stance.js';
import { formatCitationTool, FormatCitationInput } from './format-citation.js';
import { checkCurrency, CheckCurrencyInput } from './check-currency.js';
import { getEUBasis, GetEUBasisInput } from './get-eu-basis.js';
import { getFrenchImplementations, GetFrenchImplementationsInput } from './get-french-implementations.js';
import { searchEUImplementations, SearchEUImplementationsInput } from './search-eu-implementations.js';
import { getProvisionEUBasis, GetProvisionEUBasisInput } from './get-provision-eu-basis.js';
import { validateEUCompliance, ValidateEUComplianceInput } from './validate-eu-compliance.js';
import { getAbout, type AboutContext } from './about.js';
export type { AboutContext } from './about.js';

const ABOUT_TOOL: Tool = {
  name: 'about',
  description:
    'Server metadata, dataset statistics, freshness, and provenance. ' +
    'Call this to verify data coverage, currency, and content basis before relying on results.',
  inputSchema: { type: 'object', properties: {} },
};

export const TOOLS: Tool[] = [
  {
    name: 'search_legislation',
    description: 'Search French statutes and regulations by keyword. Uses FTS5 with BM25 ranking.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query. Supports FTS5 syntax.' },
        document_id: { type: 'string', description: 'Filter to a specific statute' },
        status: { type: 'string', enum: ['in_force', 'amended', 'repealed'], description: 'Filter by status' },
        limit: { type: 'number', description: 'Max results (default: 10, max: 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description: 'Retrieve a specific provision (section) from a French statute.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'Statute identifier or title' },
        section: { type: 'string', description: 'Section number (e.g., "3")' },
        provision_ref: { type: 'string', description: 'Direct provision reference' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'validate_citation',
    description: 'Validate a French legal citation against the database. Zero-hallucination check.',
    inputSchema: {
      type: 'object',
      properties: {
        citation: { type: 'string', description: 'Citation string to validate (e.g., "Section 3, Data Protection Act 2018")' },
      },
      required: ['citation'],
    },
  },
  {
    name: 'build_legal_stance',
    description: 'Build a comprehensive set of citations for a legal question across French statutes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Legal question or topic to research' },
        document_id: { type: 'string', description: 'Optionally limit to one statute' },
        limit: { type: 'number', description: 'Max results per category (default: 5, max: 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'format_citation',
    description: 'Format a French legal citation per standard conventions (full, short, or pinpoint).',
    inputSchema: {
      type: 'object',
      properties: {
        citation: { type: 'string', description: 'Citation string to format' },
        format: { type: 'string', enum: ['full', 'short', 'pinpoint'], description: 'Output format (default: "full")' },
      },
      required: ['citation'],
    },
  },
  {
    name: 'check_currency',
    description: 'Check if a French statute or provision is currently in force.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'Statute identifier or title' },
        provision_ref: { type: 'string', description: 'Optional provision reference' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_eu_basis',
    description: 'Get EU legal basis (directives/regulations) for a French statute or retained EU law.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'French statute identifier' },
        include_articles: { type: 'boolean', description: 'Include specific EU article references' },
        reference_types: { type: 'array', items: { type: 'string' }, description: 'Filter by reference type' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_french_implementations',
    description: 'Find French statutes implementing a specific EU directive or regulation.',
    inputSchema: {
      type: 'object',
      properties: {
        eu_document_id: { type: 'string', description: 'EU document ID (e.g., "regulation:2016/679")' },
        primary_only: { type: 'boolean', description: 'Return only primary implementing statutes' },
        in_force_only: { type: 'boolean', description: 'Return only in-force statutes' },
      },
      required: ['eu_document_id'],
    },
  },
  {
    name: 'search_eu_implementations',
    description: 'Search for EU directives/regulations with French implementation information.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword search' },
        type: { type: 'string', enum: ['directive', 'regulation'], description: 'Filter by type' },
        year_from: { type: 'number', description: 'Filter by year (from)' },
        year_to: { type: 'number', description: 'Filter by year (to)' },
        has_french_implementation: { type: 'boolean', description: 'Filter by French implementation' },
        limit: { type: 'number', description: 'Max results (default: 20, max: 100)' },
      },
    },
  },
  {
    name: 'get_provision_eu_basis',
    description: 'Get EU legal basis for a specific provision within a French statute.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'French statute identifier' },
        provision_ref: { type: 'string', description: 'Provision reference (e.g., "3")' },
      },
      required: ['document_id', 'provision_ref'],
    },
  },
  {
    name: 'validate_eu_compliance',
    description: 'Validate EU compliance status for a French statute or provision.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'French statute identifier' },
        provision_ref: { type: 'string', description: 'Optional provision reference' },
        eu_document_id: { type: 'string', description: 'Check compliance with specific EU document' },
      },
      required: ['document_id'],
    },
  },
];

export function buildTools(context?: AboutContext): Tool[] {
  return context ? [...TOOLS, ABOUT_TOOL] : TOOLS;
}

export function registerTools(
  server: Server,
  db: InstanceType<typeof Database>,
  context?: AboutContext,
): void {
  const allTools = buildTools(context);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_legislation':
          result = await searchLegislation(db, args as unknown as SearchLegislationInput);
          break;
        case 'get_provision':
          result = await getProvision(db, args as unknown as GetProvisionInput);
          break;
        case 'validate_citation':
          result = await validateCitationTool(db, args as unknown as ValidateCitationInput);
          break;
        case 'build_legal_stance':
          result = await buildLegalStance(db, args as unknown as BuildLegalStanceInput);
          break;
        case 'format_citation':
          result = await formatCitationTool(args as unknown as FormatCitationInput);
          break;
        case 'check_currency':
          result = await checkCurrency(db, args as unknown as CheckCurrencyInput);
          break;
        case 'get_eu_basis':
          result = await getEUBasis(db, args as unknown as GetEUBasisInput);
          break;
        case 'get_french_implementations':
          result = await getFrenchImplementations(db, args as unknown as GetFrenchImplementationsInput);
          break;
        case 'search_eu_implementations':
          result = await searchEUImplementations(db, args as unknown as SearchEUImplementationsInput);
          break;
        case 'get_provision_eu_basis':
          result = await getProvisionEUBasis(db, args as unknown as GetProvisionEUBasisInput);
          break;
        case 'validate_eu_compliance':
          result = await validateEUCompliance(db, args as unknown as ValidateEUComplianceInput);
          break;
        case 'about':
          if (context) {
            result = getAbout(db, context);
          } else {
            return {
              content: [{ type: 'text', text: 'About tool not configured.' }],
              isError: true,
            };
          }
          break;
        default:
          return {
            content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });
}
