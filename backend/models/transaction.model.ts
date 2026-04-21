export type TransactionStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface CertificateMetadata {
  transactionId: string;
  issuedAt: Date;
  certificateUrl: string;
  checksum: string;
}

export interface CarbonCreditTransaction {
  id: string;
  companyName: string;
  projectName: string;
  registry: string;
  vintageYear: number;
  shipmentId?: string | null;
  shipmentIds?: string[];
  shipmentReference?: string | null;
  shipmentReferences?: string[];
  pricePerTon: number;
  quantity: number;
  totalCost: number;
  tCO2eRetired: number;
  serialNumber: string;
  status: TransactionStatus;
  paymentReference: string;
  createdAt: Date;
  completedAt: Date | null;
}
