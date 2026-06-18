/** Maps Supabase Auth errors to user-facing German messages. */
export function mapSignupError(message: string): string {
  const m = message.toLowerCase();

  if (
    m.includes("already") ||
    m.includes("registered") ||
    m.includes("duplicate") ||
    m.includes("exists")
  ) {
    return "Für diese E-Mail existiert bereits ein Konto. Bitte melden Sie sich an.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
  }
  if (m.includes("password")) {
    return "Das Passwort erfüllt nicht die Sicherheitsanforderungen (mindestens 6 Zeichen).";
  }
  if (m.includes("signup") && m.includes("disabled")) {
    return "Registrierungen sind derzeit deaktiviert. Bitte kontaktieren Sie den Support.";
  }

  return "Registrierung fehlgeschlagen. Bitte erneut versuchen.";
}
