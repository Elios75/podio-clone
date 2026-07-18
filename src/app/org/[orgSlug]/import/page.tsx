import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportRuns, type ImportRun } from "./import-runs";
import { ConnectPodio } from "./connect-podio";

// Import-from-Podio page. Connect Podio credentials and queue imports
// in-app (via podio.* RPCs); the background importer picks queued runs up
// and this page shows live progress from podio.import_runs. The local
// importer script (scripts/podio/import-space.mjs) still works too.
export default async function ImportPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .single();
  if (!org) notFound();

  const { data: runs } = await supabase
    .from("import_runs")
    .select(
      "id, organization_id, source_space_id, source_space_name, workspace_id, status, phase, counts, notes, error, started_at, updated_at"
    )
    .eq("organization_id", org.id)
    .order("started_at", { ascending: false })
    .limit(20);

  // Resolve linked workspaces so completed runs can link straight in.
  const wsIds = [
    ...new Set((runs ?? []).map((r) => r.workspace_id).filter(Boolean)),
  ] as string[];
  const { data: workspaces } = wsIds.length
    ? await supabase.from("workspaces").select("id, slug, name").in("id", wsIds)
    : { data: [] as { id: string; slug: string; name: string }[] };

  const workspaceSlugs: Record<string, { slug: string; name: string }> = {};
  for (const ws of workspaces ?? []) {
    workspaceSlugs[ws.id] = { slug: ws.slug, name: ws.name };
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-podio-ink">
          Import from Podio
        </h1>
        <Link
          href={`/org/${org.slug}`}
          className="text-sm text-podio-secondary hover:underline"
        >
          ← Back to {org.name}
        </Link>
      </div>
      <p className="mt-1 text-sm text-podio-secondary">
        Connect your Podio API credentials, then queue imports right here —
        full guide in{" "}
        <code className="rounded bg-podio-row-alt px-1 py-0.5 text-[13px]">
          docs/PODIO-IMPORT.md
        </code>{" "}
        in the repo. This page shows live progress of each run.
      </p>

      <ConnectPodio orgId={org.id} />

      <h2 className="mt-8 text-lg font-medium text-podio-ink">Import runs</h2>
      <ImportRuns
        orgId={org.id}
        orgSlug={org.slug}
        initialRuns={(runs ?? []) as ImportRun[]}
        workspaceSlugs={workspaceSlugs}
      />

      <details className="mt-8 text-sm text-podio-secondary">
        <summary className="cursor-pointer text-xs text-podio-meta hover:text-podio-secondary">
          Advanced: run the importer locally
        </summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-podio-secondary">
          <li>
            Create a Podio API key at{" "}
            <span className="text-podio-ink">podio.com/settings/api</span> and
            put the client id/secret in{" "}
            <code className="rounded bg-podio-row-alt px-1 py-0.5 text-[13px]">
              .env.local
            </code>
            .
          </li>
          <li>
            Run the token command yourself to obtain a Podio refresh token and
            add it to{" "}
            <code className="rounded bg-podio-row-alt px-1 py-0.5 text-[13px]">
              .env.local
            </code>
            .
          </li>
          <li>
            Set{" "}
            <code className="rounded bg-podio-row-alt px-1 py-0.5 text-[13px]">
              CLONE_API_KEY
            </code>{" "}
            to an API key for this organization with write scope.
          </li>
          <li>
            Run{" "}
            <code className="rounded bg-podio-row-alt px-1 py-0.5 text-[13px]">
              node scripts/podio/import-space.mjs &lt;space_id&gt;
            </code>{" "}
            — progress appears above within a few seconds.
          </li>
        </ol>
        <p className="mt-3 text-xs text-podio-meta">
          Full operator guide, fixtures, and fidelity notes:{" "}
          <code className="rounded bg-podio-row-alt px-1 py-0.5">
            docs/PODIO-IMPORT.md
          </code>
          . Imports always create a new workspace and are safe to re-run.
        </p>
      </details>
    </main>
  );
}
