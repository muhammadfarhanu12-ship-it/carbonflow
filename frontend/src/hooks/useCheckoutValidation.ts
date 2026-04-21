import { useEffect, useState } from "react";

interface UseCheckoutValidationParams {
  availableCredits: number;
  requestedQuantity: number;
  pricePerTon: number;
}

const PLATFORM_FEE_RATE = 0.02;

export function useCheckoutValidation({
  availableCredits,
  requestedQuantity,
  pricePerTon,
}: UseCheckoutValidationParams) {
  const [error, setError] = useState("");
  const [subtotal, setSubtotal] = useState(0);
  const [platformFee, setPlatformFee] = useState(0);
  const [totalCost, setTotalCost] = useState(0);

  useEffect(() => {
    const quantity = Number(requestedQuantity) || 0;
    const unitPrice = Number(pricePerTon) || 0;
    const nextSubtotal = Number((quantity * unitPrice).toFixed(2));
    const nextPlatformFee = Number((nextSubtotal * PLATFORM_FEE_RATE).toFixed(2));
    setSubtotal(nextSubtotal);
    setPlatformFee(nextPlatformFee);
    setTotalCost(Number((nextSubtotal + nextPlatformFee).toFixed(2)));
  }, [requestedQuantity, pricePerTon]);

  useEffect(() => {
    const quantity = Number(requestedQuantity);
    const inventory = Math.max(Number(availableCredits) || 0, 0);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Invalid quantity");
      return;
    }

    if (quantity > inventory) {
      setError("Quantity exceeds available inventory");
      return;
    }

    setError("");
  }, [availableCredits, requestedQuantity]);

  return {
    error,
    subtotal,
    platformFee,
    totalCost,
    isValid: !error,
    isCheckoutDisabled: Boolean(error),
  };
}
