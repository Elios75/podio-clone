import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Developers — Podio Clone",
  description: "REST API reference, webhooks, flows, and tutorials for Podio Clone.",
};

const NAV: { href: string; label: string }[] = [
  { href: "/developers", label: "Overview" },
  { href: "/developers/authentication", label: "Authentication" },
  { href: "/developers/items", label: "Apps, Items & Tasks" },
  { href: "/developers/hooks", label: "Hooks & Webhooks" },
  { href: "/developers/flows", label: "Flows & Notifications" },
  { href: "/developers/forms", label: "Forms, Files & Export" },
  { href: "/developers/tutorials", label: "Tutorials & SDKs" },
];

export default function DevelopersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-podio-page">
      {/* Docs chrome bar — same chrome tint as the app's global top bar */}
      <div className="border-b border-podio-border bg-podio-chrome">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/" className="text-[15px] font-semibold text-podio-ink hover:text-podio-teal">
            Podio Clone
          </Link>
          <span className="text-podio-meta">/</span>
          <Link href="/developers" className="text-[15px] font-semibold text-podio-teal">
            Developers
          </Link>
          <span className="ml-auto text-xs text-podio-secondary">REST API v1.1</span>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6 sm:px-6">
        {/* Left nav pane */}
        <nav className="hidden w-52 shrink-0 md:block">
          <div className="rounded border border-podio-border bg-white py-2 shadow-sm">
            <div className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-podio-meta">
              API reference
            </div>
            <ul>
              {NAV.map((n) => (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className="block px-3 py-1.5 text-[14px] text-podio-secondary hover:bg-podio-row-hover hover:text-podio-teal"
                  >
                    {n.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Content panel */}
        <main className="min-w-0 flex-1 rounded border border-podio-border bg-white p-5 shadow-sm sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
