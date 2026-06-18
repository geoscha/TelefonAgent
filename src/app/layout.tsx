import type { Metadata } from "next";
import { Hedvig_Letters_Serif, Rethink_Sans } from "next/font/google";
import { ConditionalShell } from "@/components/layout/ConditionalShell";
import "./globals.css";
import "@/styles/retell-fonts.css";

const rethinkSans = Rethink_Sans({
  subsets: ["latin"],
  variable: "--font-rethink",
  weight: ["400", "500", "600", "700"],
});

const hedvigSerif = Hedvig_Letters_Serif({
  subsets: ["latin"],
  variable: "--font-hedvig",
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Cura — KI-Telefonagent für automatisierte Anrufe",
  description:
    "Erstellen, einsetzen und verwalten Sie KI-Telefonagenten der nächsten Generation — natürlich klingend, aufgabenorientiert und mühelos skalierbar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de-CH">
      <body className={`${rethinkSans.variable} ${hedvigSerif.variable} font-sans`}>
        <ConditionalShell>{children}</ConditionalShell>
      </body>
    </html>
  );
}
