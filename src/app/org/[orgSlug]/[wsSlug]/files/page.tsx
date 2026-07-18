import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppTabBar } from "../app-tab-bar";

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function WorkspaceFilesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; wsSlug: string }>;
}) {
  const { orgSlug, wsSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations").select("id, slug").eq("slug", orgSlug).single();
  if (!org) notFound();
  const { data: ws } = await supabase
    .from("workspaces").select("id, name, slug")
    .eq("organization_id", org.id).eq("slug", wsSlug).single();
  if (!ws) notFound();

  // Workspace chrome: the app tab bar must NEVER disappear on workspace pages.
  const { data: siblingApps } = await supabase
    .from("apps")
    .select("id, name, slug, icon")
    .eq("workspace_id", ws.id)
    .eq("is_archived", false)
    .order("name");

  const { data: files } = await supabase
    .from("files")
    .select("id, name, storage_path, mime_type, size_bytes, uploaded_by, created_at")
    .eq("workspace_id", ws.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const paths = (files ?? []).map((f) => f.storage_path).filter(Boolean) as string[];
  const { data: signedArr } = paths.length
    ? await supabase.storage.from("podio-files").createSignedUrls(paths, 3600)
    : { data: [] as any[] };
  const signedByPath = new Map(
    (signedArr ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl])
  );

  const uploaderIds = [...new Set((files ?? []).map((f) => f.uploaded_by).filter(Boolean))];
  const { data: profiles } = uploaderIds.length
    ? await supabase.from("user_profiles").select("user_id, full_name").in("user_id", uploaderIds)
    : { data: [] as any[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]));

  const total = (files ?? []).reduce((a, f) => a + Number(f.size_bytes ?? 0), 0);

  return (
    <main className="min-h-screen bg-podio-page pb-10">
      <AppTabBar orgSlug={orgSlug} wsSlug={wsSlug} apps={siblingApps ?? []} />
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Files — {ws.name}</h1>
        <Link href={`/org/${orgSlug}/${ws.slug}`}
          className="text-sm text-slate-500 hover:underline">← Workspace</Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {(files ?? []).length} file{(files ?? []).length === 1 ? "" : "s"} ·{" "}
        {fmtSize(total)} total
      </p>

      <ul className="mt-6 space-y-2">
        {(files ?? []).map((f) => {
          const url = f.storage_path ? signedByPath.get(f.storage_path) : null;
          return (
            <li key={f.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
              <span>{f.mime_type?.startsWith("image/") ? "🖼" : "📄"}</span>
              {url ? (
                <a href={url} target="_blank"
                  className="min-w-0 truncate font-medium text-blue-600 hover:underline">
                  {f.name}
                </a>
              ) : (
                <span className="min-w-0 truncate font-medium">{f.name}</span>
              )}
              <span className="ml-auto flex shrink-0 gap-3 text-xs text-slate-400">
                <span>{fmtSize(Number(f.size_bytes ?? 0))}</span>
                <span>{f.uploaded_by ? nameOf.get(f.uploaded_by) ?? "Member" : "System"}</span>
                <span>{new Date(f.created_at).toLocaleDateString()}</span>
              </span>
            </li>
          );
        })}
        {(files ?? []).length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            No files in this workspace yet — attach some to items or comments.
          </li>
        )}
      </ul>
    </div>
    </main>
  );
}
