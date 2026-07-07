import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "./sw-register";

// Typography: the current Progress-era Podio UI renders in the operating
// system's own UI font (Segoe UI on Windows, SF Pro on macOS) — it does NOT
// ship a webfont. We match it with the same system stack (declared in
// tailwind.config.ts fontFamily.sans), so the clone is pixel-identical to
// Podio on every platform. The old self-hosted Source Sans 3 (classic
// Podio's face) has been removed.

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
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (Grammarly, password
          managers, …) inject attributes into <body> before React hydrates,
          which otherwise triggers a spurious hydration-mismatch warning. */}
      <body className="font-sans" suppressHydrationWarning>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
