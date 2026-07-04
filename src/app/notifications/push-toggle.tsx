"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Web-push subscribe/unsubscribe toggle. Renders nothing when the browser
// lacks Notification/Push support or NEXT_PUBLIC_VAPID_PUBLIC_KEY is unset.

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type PushState = "unsupported" | "idle" | "busy" | "enabled";

export function PushToggle() {
  const [state, setState] = useState<PushState>("unsupported");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      !VAPID_KEY ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setState(sub ? "enabled" : "idle");
      })
      .catch(() => {
        if (!cancelled) setState("idle");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "unsupported" || !VAPID_KEY) return null;

  async function enable() {
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("idle");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          VAPID_KEY!
        ) as unknown as BufferSource,
      });
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setState("idle");
        return;
      }
      const { error: upsertError } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint: sub.endpoint,
            keys: sub.toJSON().keys ?? {},
            user_agent: navigator.userAgent,
          },
          { onConflict: "endpoint" }
        );
      if (upsertError) {
        setError(upsertError.message);
        setState("idle");
        return;
      }
      setState("enabled");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable push");
      setState("idle");
    }
  }

  async function disable() {
    setState("busy");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const supabase = createClient();
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("idle");
    } catch {
      setState("idle");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {state === "enabled" ? (
        <>
          <span className="text-sm font-medium text-[#15808D]">
            Push enabled ✓
          </span>
          <button
            onClick={disable}
            className="rounded border border-[#E3E3E3] px-2 py-1 text-xs text-[#6E7A7A] hover:bg-[#ECECEC]"
          >
            Disable
          </button>
        </>
      ) : (
        <button
          onClick={enable}
          disabled={state === "busy"}
          className="rounded bg-[#15808D] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0F6D79] disabled:opacity-50"
        >
          {state === "busy" ? "Enabling…" : "Enable push notifications"}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
