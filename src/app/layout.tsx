import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SwRegister } from "./sw-register";

// Podio's UI typeface is Source Sans (Pro → now "Source Sans 3").
// SELF-HOSTED (src/app/fonts/, OFL-licensed): next/font/google needs to
// reach Google Fonts at build time, and when that fetch fails it still
// stamps <body> with private font names that resolve to nothing — which
// out-specificities every fallback and lands on serif. A local file makes
// the font deterministic: no network, no failure mode.
const sourceSans = localFont({
  src: "./fonts/SourceSans3-Variable.woff2",
  weight: "200 900",
  variable: "--font-source-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Podio Clone",
  description: "Low-code work management platform",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Podio Clone" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#15808D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body className={`${sourceSans.className} font-sans`}>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
