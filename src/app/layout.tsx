import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { SwRegister } from "./sw-register";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
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
      <body className="font-sans">
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
