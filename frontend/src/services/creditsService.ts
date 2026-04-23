import { axiosClient } from "./apiClient";
import type {
  CarbonCreditTransaction,
  CheckoutTransactionResult,
  CreditCheckoutPayload,
} from "@/src/types/platform";

export const creditsService = {
  startCheckout: async (payload: CreditCheckoutPayload) => {
    const response = await axiosClient.post("/checkout/start", payload, {
      headers: payload.idempotencyKey
        ? {
          "Idempotency-Key": payload.idempotencyKey,
        }
        : undefined,
    });

    return response.data?.data as CheckoutTransactionResult;
  },

  completeCheckout: async (transactionId: string) => {
    const response = await axiosClient.post("/checkout/complete", {
      transactionId,
    }, {
    });

    return response.data?.data as CarbonCreditTransaction;
  },

  checkout: async (payload: CreditCheckoutPayload) => {
    const started = await creditsService.startCheckout(payload);
    return creditsService.completeCheckout(started.transactionId);
  },

  getTransaction: async (id: string) => {
    const response = await axiosClient.get(`/credits/${id}`);
    return response.data?.data as CarbonCreditTransaction;
  },

  downloadCertificate: async (id: string) => {
    const certificatePath = `/credits/${id}/certificate`;

    const response = await axiosClient.get(certificatePath, {
      responseType: "blob",
    });
    const blob = response.data as Blob;
    if (!blob || blob.size === 0) {
      throw new Error("Certificate file is empty.");
    }

    const contentDisposition = String(response.headers["content-disposition"] || "");
    const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);

    return {
      blob,
      fileName: fileNameMatch?.[1] || `certificate-${id}.pdf`,
    };
  },
};
