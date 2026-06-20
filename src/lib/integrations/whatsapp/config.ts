import "server-only";

export function isWhatsAppCloudConfigured(): boolean {
  return Boolean(
    process.env.META_WHATSAPP_ACCESS_TOKEN?.trim() &&
      process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()
  );
}

export function getWhatsAppWebhookVerifyToken(): string | undefined {
  return process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || undefined;
}

export function getWhatsAppAccessToken(): string | undefined {
  return process.env.META_WHATSAPP_ACCESS_TOKEN?.trim() || undefined;
}

export function getWhatsAppPhoneNumberId(): string | undefined {
  return process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || undefined;
}
