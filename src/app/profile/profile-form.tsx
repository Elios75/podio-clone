"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Profile editor: photo upload (public avatars bucket, own folder) + display
// name, saved to user_profiles. avatar_url stores the bucket's stable public
// URL so it renders everywhere without signing.
export function ProfileForm({
  userId,
  email,
  initialName,
  initialAvatarUrl,
}: {
  userId: string;
  email: string;
  initialName: string;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initials =
    (name || email)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";

  async function uploadAvatar(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: upError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    setBusy(false);
    if (upError) {
      setError(upError.message);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setMessage("Photo uploaded — remember to Save.");
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: upError } = await supabase
      .from("user_profiles")
      .update({ full_name: name.trim() || null, avatar_url: avatarUrl })
      .eq("user_id", userId);
    setSaving(false);
    if (upError) {
      setError(upError.message);
      return;
    }
    setMessage("Profile saved.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-full border border-podio-border object-cover"
          />
        ) : (
          <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-podio-secondary text-2xl font-semibold text-white">
            {initials}
          </span>
        )}
        <div>
          <label className="inline-block cursor-pointer rounded border border-podio-border bg-white px-3 py-1.5 text-sm text-podio-ink hover:bg-podio-row-alt">
            {busy ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
                e.target.value = "";
              }}
            />
          </label>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => {
                setAvatarUrl(null);
                setMessage("Photo removed — remember to Save.");
              }}
              className="ml-2 text-sm text-podio-meta hover:text-red-600"
            >
              Remove
            </button>
          )}
          <p className="mt-1 text-xs text-podio-meta">
            A square image works best.
          </p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-podio-secondary">
          Full name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded border border-podio-border bg-white px-3 py-2 text-[15px] text-podio-ink outline-none placeholder:text-podio-meta focus:border-podio-teal"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-podio-secondary">
          Email
        </label>
        <p className="text-[15px] text-podio-ink">{email}</p>
        <p className="mt-0.5 text-xs text-podio-meta">
          Change your email and password in Account settings.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded bg-podio-teal px-4 py-2 text-sm font-semibold text-white hover:bg-podio-teal-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && <span className="text-sm text-podio-secondary">{message}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
