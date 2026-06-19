"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  clearPendingStripeCheckout,
  reconcilePendingStripeCheckout,
} from "@/lib/billing/pending-checkout-client";
import {
  clearTopupParamsFromUrl,
  handleTopupReturnParams,
} from "@/lib/billing/topup-return-client";

export interface StripeCheckoutReturnSuccess {
  tokens?: number;
  duplicate?: boolean;
}

interface UseStripeCheckoutReturnOptions {
  pathname: string;
  onSuccess?: (result: StripeCheckoutReturnSuccess) => void;
  onCancel?: () => void;
}

/** Handles Stripe return via redirect URL or browser-back after Apple Pay. */
export function useStripeCheckoutReturn({
  pathname,
  onSuccess,
  onCancel,
}: UseStripeCheckoutReturnOptions): void {
  const onSuccessRef = useRef(onSuccess);
  const onCancelRef = useRef(onCancel);
  onSuccessRef.current = onSuccess;
  onCancelRef.current = onCancel;

  const reconcile = useCallback(async () => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const topup = params.get("topup");

    if (topup) {
      const result = await handleTopupReturnParams(params);
      if (!result.handled) return;

      if (topup === "cancel") {
        clearPendingStripeCheckout();
        onCancelRef.current?.();
      } else if (result.success) {
        clearPendingStripeCheckout();
        onSuccessRef.current?.({
          tokens: result.tokens,
          duplicate: result.duplicate,
        });
      }

      clearTopupParamsFromUrl(pathname);
      return;
    }

    const pending = await reconcilePendingStripeCheckout();
    if (pending.handled && pending.success) {
      onSuccessRef.current?.({
        tokens: pending.tokens,
        duplicate: pending.duplicate,
      });
    }
  }, [pathname]);

  useEffect(() => {
    void reconcile();
  }, [reconcile]);

  useEffect(() => {
    function onPageShow() {
      void reconcile();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void reconcile();
      }
    }

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reconcile]);
}
