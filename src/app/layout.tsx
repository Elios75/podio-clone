import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { SwRegister } from "./sw-register";

// Podio's UI typeface is Source Sans (Pro → now "Source Sans 3").
// We apply it two ways for robustness: the variable feeds Tailwind's
// font-sans stack, and sourceSans.className on <body> sets the family
// directly so the app never falls back to serif even if the CSS variable
// is missing.
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
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
