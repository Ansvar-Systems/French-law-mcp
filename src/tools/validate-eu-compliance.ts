/**
 * validate_eu_compliance — Check French statute's EU/retained EU law compliance status.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';
import { resolveExistingStatuteId } from '../utils/statute-id.js';

export interface ValidateEUComplianceInput {
  document_id: string;
  provision_ref?: string;
  eu_document_id?: string;
}

export interface EUComplianceResult {
  document_id: string;
  provision_ref?: string;
  compliance_status: 'compliant' | 'partial' | 'unclear' | 'not_applicable';
  eu_references_found: number;
  warnings: string[];
  recommendations?: string[];
}

export async function validateEUCompliance(
  db: Database,
  input: ValidateEUComplianceInput
): Promise<ToolResponse<EUComplianceResult>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  const resolvedId = resolveExistingStatuteId(db, input.document_id);
  if (!resolvedId) {
    throw new Error(`Document "${input.document_id}" not found in database`);
  }

  let sql = `
    SELECT ed.id, ed.type, ed.title, er.reference_type, er.is_primary_implementation
    FROM eu_documents ed
    JOIN eu_references er ON ed.id = er.eu_document_id
    WHERE er.document_id = ?
  `;
  const params: (string | number)[] = [resolvedId];

  if (input.eu_document_id) {
    sql += ` AND ed.id = ?`;
    params.push(input.eu_document_id);
  }

  interface Row {
    id: string; type: string; title: string | null;
    reference_type: string; is_primary_implementation: number;
  }

  const rows = db.prepare(sql).all(...params) as Row[];

  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (rows.length === 0) {
    recommendations.push(
      'No EU references found. If this statute implements EU law, consider adding EU references.'
    );
  }

  const status: EUComplianceResult['compliance_status'] =
    rows.length === 0 ? 'not_applicable' :
    warnings.length > 0 ? 'unclear' : 'compliant';

  return {
    results: {
      document_id: resolvedId,
      provision_ref: input.provision_ref,
      compliance_status: status,
      eu_references_found: rows.length,
      warnings,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    },
    _metadata: generateResponseMetadata(db),
  };
}
