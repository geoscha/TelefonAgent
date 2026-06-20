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
