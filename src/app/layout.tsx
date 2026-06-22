import type { Metadata } from "next";
import { ConditionalShell } from "@/components/layout/ConditionalShell";
import "./globals.css";
import "@/styles/retell-fonts.css";

export const metadata: Metadata = {
  title: "Linker — KI-Telefonagent für automatisierte Anrufe",
  description:
    "Linker nimmt Mieter- und Eigentümeranrufe entgegen, erfasst Schadensmeldungen strukturiert, vereinbart Besichtigungstermine und entlastet Ihr Team — natürlich klingend und rund um die Uhr.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de-CH">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Hedvig+Letters+Serif&family=Rethink+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">
        <ConditionalShell>{children}</ConditionalShell>
      </body>
    </html>
  );
}
