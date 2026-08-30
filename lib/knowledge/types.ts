export const DOCUMENT_STATUSES = ["stored"] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type KnowledgeDocument = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
};
