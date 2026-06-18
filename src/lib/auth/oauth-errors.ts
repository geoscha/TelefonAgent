const PROVIDER_NOT_ENABLED =
  "Google-Anmeldung ist in Supabase noch nicht aktiv. Gehen Sie zu Authentication → Providers → Google, aktivieren Sie den Provider und tragen Sie Client ID sowie Client Secret ein.";

const MISSING_OAUTH_SECRET =
  "In Supabase fehlt das Google Client Secret. Unter Authentication → Providers → Google müssen Client ID und Client Secret aus der Google Cloud Console eingetragen sein.";

export function mapGoogleSignInError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();

  if (m.includes("missing oauth secret")) {
    return MISSING_OAUTH_SECRET;
  }

  if (m.includes("not enabled") || m.includes("unsupported provider")) {
    return PROVIDER_NOT_ENABLED;
  }

  return "Google-Anmeldung konnte nicht gestartet werden. Bitte erneut versuchen.";
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth:
    "Anmeldung mit Google fehlgeschlagen. Bitte erneut versuchen oder E-Mail verwenden.",
  oauth_cancelled: "Google-Anmeldung abgebrochen.",
  oauth_not_configured: PROVIDER_NOT_ENABLED,
  oauth_missing_secret: MISSING_OAUTH_SECRET,
  auth: "Anmeldung fehlgeschlagen. Bitte erneut versuchen.",
};

export function mapOAuthLoginError(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? OAUTH_ERROR_MESSAGES.oauth;
}
