/** Original brand logos provided for the integrations UI. */
export const INTEGRATION_LOGOS = {
  gmail: {
    src: "/integrations/gmail.png",
    width: 512,
    height: 512,
  },
  outlook: {
    src: "/integrations/outlook-mail.png",
    width: 512,
    height: 512,
  },
  appleMail: {
    src: "/integrations/apple-mail.png",
    width: 960,
    height: 960,
  },
  whatsapp: {
    src: "/integrations/whatsapp.png",
    width: 512,
    height: 512,
  },
  immotop2: {
    src: "/integrations/immotop2.png",
    width: 512,
    height: 512,
  },
  abacus: {
    src: "/integrations/abacus.png",
    width: 512,
    height: 512,
  },
  fairwalter: {
    src: "/integrations/fairwalter.png",
    width: 512,
    height: 512,
  },
  garaioRem: {
    src: "/integrations/garaio-rem.png",
    width: 512,
    height: 512,
  },
  rimoR5: {
    src: "/integrations/rimo-r5.png",
    width: 512,
    height: 512,
  },
  excel: {
    src: "/integrations/excel.png",
    width: 512,
    height: 512,
  },
  twilioSms: {
    src: "/integrations/twilio-sms.png",
    width: 512,
    height: 512,
  },
  sevenSms: {
    src: "/integrations/seven-sms.png",
    width: 512,
    height: 512,
  },
  aspsms: {
    src: "/integrations/aspsms.png",
    width: 512,
    height: 512,
  },
} as const;

export const CALENDAR_LOGOS = {
  google: {
    src: "/integrations/google-calendar.png",
    width: 960,
    height: 960,
  },
  microsoft: {
    src: "/integrations/microsoft-outlook.png",
    width: 960,
    height: 894,
  },
  apple: {
    src: "/integrations/apple-calendar.png",
    width: 960,
    height: 960,
  },
} as const;

export type IntegrationLogoAsset = {
  src: string;
  width: number;
  height: number;
  label: string;
};

/** All connectable integrations — used on the landing hero marquee. */
export const LANDING_INTEGRATION_MARQUEE: IntegrationLogoAsset[] = [
  { ...CALENDAR_LOGOS.google, label: "Google Kalender" },
  { ...CALENDAR_LOGOS.microsoft, label: "Microsoft Outlook" },
  { ...CALENDAR_LOGOS.apple, label: "Apple Kalender" },
  { ...INTEGRATION_LOGOS.gmail, label: "Gmail" },
  { ...INTEGRATION_LOGOS.outlook, label: "Outlook Mail" },
  { ...INTEGRATION_LOGOS.appleMail, label: "Apple Mail" },
  { ...INTEGRATION_LOGOS.whatsapp, label: "WhatsApp" },
  { ...INTEGRATION_LOGOS.immotop2, label: "ImmoTop2" },
  { ...INTEGRATION_LOGOS.rimoR5, label: "Rimo R5" },
  { ...INTEGRATION_LOGOS.garaioRem, label: "GARAIO REM" },
  { ...INTEGRATION_LOGOS.fairwalter, label: "Fairwalter" },
  { ...INTEGRATION_LOGOS.abacus, label: "Abacus" },
  { ...INTEGRATION_LOGOS.excel, label: "Microsoft Excel" },
];
