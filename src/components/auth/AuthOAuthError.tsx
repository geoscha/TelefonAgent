"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { authErrorClass } from "@/components/landing/AuthFrame";
import { mapOAuthLoginError } from "@/lib/auth/oauth-errors";

function AuthOAuthErrorInner() {
  const searchParams = useSearchParams();
  const message = mapOAuthLoginError(searchParams.get("error"));

  if (!message) return null;

  return (
    <p className={authErrorClass} role="alert">
      {message}
    </p>
  );
}

export function AuthOAuthError() {
  return (
    <Suspense fallback={null}>
      <AuthOAuthErrorInner />
    </Suspense>
  );
}
