/**
 * Twilio telephony integration stub.
 * TODO: Connect to Twilio for phone number provisioning and call routing.
 * @see https://www.twilio.com/docs/voice
 */

export interface TwilioPhoneNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  status: "active" | "pending" | "released";
}

export async function listPhoneNumbers(): Promise<TwilioPhoneNumber[]> {
  // TODO: GET /2010-04-01/Accounts/{AccountSid}/IncomingPhoneNumbers.json
  return [];
}

export async function provisionPhoneNumber(
  areaCode: string
): Promise<TwilioPhoneNumber> {
  // TODO: Purchase and configure a Swiss phone number
  void areaCode;
  throw new Error("Twilio integration not yet implemented");
}

export async function configureWebhook(
  phoneNumberSid: string,
  webhookUrl: string
): Promise<void> {
  // TODO: Update voice webhook URL for incoming calls
  void phoneNumberSid;
  void webhookUrl;
  throw new Error("Twilio integration not yet implemented");
}

export async function verifyPhoneNumber(
  phoneNumber: string
): Promise<{ verified: boolean; code?: string }> {
  // TODO: Send verification code via SMS
  void phoneNumber;
  return { verified: false, code: "123456" };
}
