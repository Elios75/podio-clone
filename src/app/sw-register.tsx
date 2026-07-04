"use client";

import { useEffect } from "react";

// Registers the service worker once on the client. Rendered from the root
// layout (which stays a server component — this child opts into the client).
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failing (e.g. unsupported/insecure context) is fine.
      });
    }
  }, []);
  return null;
}
