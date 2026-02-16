export type DocumentType = 'statute' | 'statutory_instrument' | 'retained_eu_law';
export type DocumentStatus = 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';

export interface LegalDocument {
  id: string;
  title: string;
  title_en?: string;
  short_name?: string;
  document_type: DocumentType;
  status: DocumentStatus;
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  description?: string;
}
