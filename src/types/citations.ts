export type CitationFormat = 'full' | 'short' | 'pinpoint';

export interface ParsedCitation {
  valid: boolean;
  type: 'statute' | 'statutory_instrument' | 'unknown';
  title?: string;
  year?: number;
  section?: string;
  subsection?: string;
  paragraph?: string;
  error?: string;
}

export interface ValidationResult {
  citation: ParsedCitation;
  document_exists: boolean;
  provision_exists: boolean;
  document_title?: string;
  status?: string;
  warnings: string[];
}
