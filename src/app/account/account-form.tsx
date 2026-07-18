"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Account settings: change the sign-in email (Supabase sends a confirmation
// link to the new address) and the password.
export function AccountForm({ email }: { email: string }) {
  const supabase = createClient();
  const [newEmail, setNewEmail] = useState(email);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full rounded border border-podio-border bg-white px-3 py-2 text-[15px] text-podio-ink outline-none placeholder:text-podio-meta focus:border-podio-teal";

  async function changeEmail() {
    const next = newEmail.trim();
    if (!next || next === email || emailBusy) return;
    setEmailBusy(true);
    setError(null);
    setEmailMsg(null);
    const { error: upError } = await supabase.auth.updateUser({ email: next });
    setEmailBusy(false);
    if (upError) {
      setError(upError.message);
      return;
    }
    setEmailMsg(`Confirmation link sent to ${next} — the change applies once confirmed.`);
  }

  async function changePassword() {
    if (pwBusy) return;
    setError(null);
    setPwMsg(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPwBusy(true);
    const { error: upError } = await supabase.auth.updateUser({ password });
    setPwBusy(false);
    if (upError) {
      setError(upError.message);
      return;
    }
    setPassword("");
    setConfirm("");
    setPwMsg("Password updated.");
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1 block text-xs font-semibold text-podio-secondary">
          Sign-in email
        </label>
        <div className="flex items-center gap-2">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            className={inputCls}
          />
          <button
            type="button"
            onClick={changeEmail}
            disabled={emailBusy || newEmail.trim() === email}
            className="shrink-0 rounded border border-podio-border bg-white px-3 py-2 text-sm text-podio-ink hover:bg-podio-row-alt disabled:opacity-50"
          >
            {emailBusy ? "Sending…" : "Change"}
          </button>
        </div>
        {emailMsg && <p className="mt-1 text-xs text-podio-secondary">{emailMsg}</p>}
      </div>

      <div className="border-t border-podio-border pt-5">
        <label className="mb-1 block text-xs font-semibold text-podio-secondary">
          New password
        </label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="At least 8 characters"
          className={inputCls}
        />
        <label className="mb-1 mt-3 block text-xs font-semibold text-podio-secondary">
          Confirm new password
        </label>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          type="password"
          className={inputCls}
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={changePassword}
            disabled={pwBusy || !password}
            className="rounded bg-podio-teal px-4 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-60"
          >
            {pwBusy ? "Updating…" : "Update password"}
          </button>
          {pwMsg && <span className="text-sm text-podio-secondary">{pwMsg}</span>}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
