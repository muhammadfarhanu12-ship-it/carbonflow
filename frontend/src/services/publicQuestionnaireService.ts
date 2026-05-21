import { apiClient } from "./apiClient";

export type PublicQuestionnaireContext = {
  supplierId: string;
  supplierName: string;
  requestingCompanyName: string;
  companyName?: string;
  dueDate: string | null;
  tokenExpiresAt: string | null;
  requestedFields: string[];
  status: string;
  alreadySubmitted: boolean;
  expired: boolean;
};

export type PublicQuestionnaireSubmission = {
  contactName?: string;
  contactEmail?: string;
  country?: string;
  region?: string;
  category?: string;
  totalEmissions: number;
  revenueOrActivityBase: number;
  emissionIntensity?: number | "";
  reportingPeriod: string;
  verificationStatus: string;
  certifications: string[];
  evidenceNotes?: string;
  notes?: string;
  additionalComments?: string;
  questionnaireAnswers?: Record<string, string>;
};

export type PublicQuestionnaireSubmissionResult = {
  supplierId: string;
  status: string;
  submittedAt: string | null;
  riskLevel: string;
  esgScore: number;
  message: string;
};

export const publicQuestionnaireService = {
  getQuestionnaire(token: string) {
    return apiClient.get<PublicQuestionnaireContext>(`/public/questionnaire/${encodeURIComponent(token)}`);
  },
  submitQuestionnaire(token: string, payload: PublicQuestionnaireSubmission) {
    return apiClient.post<PublicQuestionnaireSubmissionResult>(
      `/public/questionnaire/${encodeURIComponent(token)}/submit`,
      payload,
    );
  },
  uploadEvidence(
    token: string,
    file: File,
    data: { evidenceType: string; title?: string; expiresAt?: string | null; notes?: string | null },
    onUploadProgress?: (progress: number) => void,
  ) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("evidenceType", data.evidenceType);
    formData.append("title", data.title || file.name);
    if (data.expiresAt) formData.append("expiresAt", data.expiresAt);
    if (data.notes) formData.append("notes", data.notes);
    return apiClient.postFormWithProgress(`/public/questionnaire/${encodeURIComponent(token)}/evidence/upload`, formData, onUploadProgress);
  },
};
