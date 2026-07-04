"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // If the email's domain enforces SSO, block password auth
    const { data: sso } = await supabase.rpc("sso_domain_lookup", {
      p_email: email,
    });
    if (sso?.enforce) {
      setLoading(false);
      setError("Your organization requires single sign-on. Use 'Continue with SSO'.");
      return;
    }

    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/home");
    router.refresh();
  }

  async function handleSso() {
    setError(null);
    if (!email.includes("@")) {
      setError("Enter your work email first, then choose SSO.");
      return;
    }
    const { data: sso } = await supabase.rpc("sso_domain_lookup", {
      p_email: email,
    });
    if (!sso?.sso) {
      setError("No SSO provider is configured for that email domain.");
      return;
    }
    const { data, error: ssoError } = await supabase.auth.signInWithSSO({
      domain: sso.domain,
    });
    if (ssoError) {
      setError(
        ssoError.message.includes("sso")
          ? "SSO provider not registered with Supabase yet — see docs/SSO.md."
          : ssoError.message
      );
      return;
    }
    if (data?.url) window.location.href = data.url;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-podio-page p-4">
      <div className="w-full max-w-sm rounded-lg border border-podio-border bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-podio-ink">Podio Clone</h1>
        <p className="mt-1 text-sm text-podio-secondary">
          {mode === "signin" ? "Sign in to your account" : "Create an account"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-podio-border px-3 py-2 text-sm focus:border-podio-teal focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-podio-border px-3 py-2 text-sm focus:border-podio-teal focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-podio-teal px-3 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-50"
          >
            {loading ? "Working…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          onClick={handleSso}
          className="mt-3 w-full rounded border border-podio-border px-3 py-2 text-sm font-semibold text-podio-ink hover:bg-podio-row-alt"
        >
          Continue with SSO
        </button>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 text-sm text-podio-teal hover:underline"
        >
          {mode === "signin"
            ? "New here? Create an account"
            : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
