"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PodioIcon } from "@/components/podio-icon";

// Global-bar avatar dropdown, structured like real Podio's user menu:
// avatar + name header, then My profile / Account settings / Create another
// organization, a Pricing/Billing section (present but disabled until
// billing is wired up), Batch jobs / My shared apps (disabled placeholders),
// and Sign out with the door icon.

type MenuUser = { id: string; name: string | null; avatarUrl: string | null };

function initialsOf(name: string | null) {
  return (
    (name ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function UserMenu({ user }: { user: MenuUser }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function avatar(cls: string, textCls: string) {
    return user.avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        className={`${cls} shrink-0 rounded-full object-cover`}
      />
    ) : (
      <span
        className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-podio-secondary font-semibold text-white ${textCls}`}
      >
        {initialsOf(user.name)}
      </span>
    );
  }

  const itemCls =
    "block px-5 py-2.5 text-[15px] text-podio-ink hover:bg-podio-row-alt";
  const disabledCls =
    "block cursor-not-allowed px-5 py-2.5 text-[15px] text-podio-disabled";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={user.name ?? "Account"}
        aria-expanded={open}
        className="block hover:opacity-80"
      >
        {avatar("h-7 w-7", "text-xs")}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded border border-podio-border bg-white py-1 shadow-lg">
          <div className="flex items-center gap-3 px-5 py-3.5">
            {avatar("h-12 w-12", "text-base")}
            <span className="truncate text-[17px] font-semibold text-podio-ink">
              {user.name ?? "Set your name"}
            </span>
          </div>

          <div className="border-t border-podio-border py-1.5">
            <Link href="/profile" onClick={() => setOpen(false)} className={itemCls}>
              My profile
            </Link>
            <Link href="/account" onClick={() => setOpen(false)} className={itemCls}>
              Account settings
            </Link>
            <Link href="/home" onClick={() => setOpen(false)} className={itemCls}>
              Create another organization
            </Link>
          </div>

          {/* Present to mirror Podio's structure; wired up when billing ships. */}
          <div className="border-t border-podio-border py-1.5">
            <span className={disabledCls} title="Coming soon">
              Pricing
            </span>
            <span className={disabledCls} title="Coming soon">
              Billing
            </span>
          </div>

          <div className="border-t border-podio-border py-1.5">
            <span className={disabledCls} title="Coming soon">
              Batch jobs
            </span>
            <span className={disabledCls} title="Coming soon">
              My shared apps
            </span>
          </div>

          <div className="border-t border-podio-border pt-1.5">
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/login");
                router.refresh();
              }}
              className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-[15px] text-podio-ink hover:bg-podio-row-alt"
            >
              <PodioIcon icon="share-out" className="h-4 w-4 text-podio-secondary" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
