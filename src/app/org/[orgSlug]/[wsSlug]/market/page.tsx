import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InstallButton } from "./install-button";

export default async function MarketPage({
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
    .from("workspaces").select("id, slug")
    .eq("organization_id", org.id).eq("slug", wsSlug).single();
  if (!ws) notFound();

  // RLS returns public templates + this org's templates
  const { data: templates } = await supabase
    .from("app_templates")
    .select("id, name, description, category, visibility, install_count, definition")
    .order("install_count", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">App market</h1>
      <p className="mt-1 text-sm text-slate-500">
        Install a pre-built app structure into this workspace, then customize it.
      </p>

      <ul className="mt-6 space-y-3">
        {(templates ?? []).map((t: any) => (
          <li key={t.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">{t.definition?.app?.icon ?? "📋"}</span>
              <span className="font-medium">{t.name}</span>
              {t.category && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {t.category}
                </span>
              )}
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {t.visibility === "public" ? "Public" : "Organization"}
              </span>
              <span className="ml-auto text-xs text-slate-400">
                {t.install_count} install{t.install_count === 1 ? "" : "s"}
              </span>
            </div>
            {t.description && (
              <p className="mt-1 text-sm text-slate-500">{t.description}</p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {(t.definition?.fields ?? []).length} fields
            </p>
            <div className="mt-2">
              <InstallButton
                templateId={t.id}
                wsId={ws.id}
                orgSlug={orgSlug}
                wsSlug={wsSlug}
              />
            </div>
          </li>
        ))}
        {(templates ?? []).length === 0 && (
          <li className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            No templates yet. Open any app and choose “Save as template”.
          </li>
        )}
      </ul>
    </main>
  );
}
