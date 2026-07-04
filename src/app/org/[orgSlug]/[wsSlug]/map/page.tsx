import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const NODE_W = 150;
const NODE_H = 46;

type MapNode = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  external: boolean;
  cx: number;
  cy: number;
};

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Distance from a node's center to its rect boundary along a unit direction,
// plus a little padding so arrowheads don't touch the border.
function rectTrim(ux: number, uy: number) {
  const tx = ux !== 0 ? (NODE_W / 2 + 6) / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? (NODE_H / 2 + 6) / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

export default async function RelationshipMapPage({
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

  const { data: apps } = await supabase
    .from("apps")
    .select("id, name, slug, icon")
    .eq("workspace_id", ws.id)
    .eq("is_archived", false)
    .order("name");

  const appIds = (apps ?? []).map((a) => a.id);
  const { data: relFields } = appIds.length
    ? await supabase
        .from("app_fields")
        .select("id, app_id, label, config")
        .in("app_id", appIds)
        .eq("type", "relationship")
        .eq("status", "active")
    : { data: [] as any[] };

  // Related apps that live outside this workspace.
  const inWsIds = new Set(appIds);
  const externalIds = [
    ...new Set(
      (relFields ?? [])
        .map((f: any) => f.config?.related_app_id as string | undefined)
        .filter((id): id is string => !!id && !inWsIds.has(id))
    ),
  ];
  const { data: externalApps } = externalIds.length
    ? await supabase.from("apps").select("id, name, slug, icon").in("id", externalIds)
    : { data: [] as any[] };

  // ----- Circle layout (computed server-side) -----
  const rawNodes = [
    ...(apps ?? []).map((a) => ({ ...a, external: false })),
    ...((externalApps ?? []) as any[]).map((a) => ({ ...a, external: true })),
  ];
  const n = rawNodes.length;
  const radius = n <= 1 ? 0 : Math.max(170, n * 32);
  const margin = 40;
  const width = Math.max(560, 2 * (radius + NODE_W / 2 + margin));
  const height = Math.max(480, 2 * radius + NODE_H + 2 * margin);
  const centerX = width / 2;
  const centerY = height / 2;

  const nodes: MapNode[] = rawNodes.map((a: any, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      icon: a.icon ?? null,
      external: a.external,
      cx: centerX + radius * Math.cos(angle),
      cy: centerY + radius * Math.sin(angle),
    };
  });
  const nodeById = new Map(nodes.map((nd) => [nd.id, nd]));

  // ----- Edges (one per relationship field) -----
  type EdgeT = {
    key: string;
    sourceName: string;
    targetName: string;
    targetExternal: boolean;
    label: string;
    self: boolean;
    x1: number; y1: number; x2: number; y2: number;
    lx: number; ly: number;
  };
  const edges: EdgeT[] = [];
  const pairSeen = new Map<string, number>();
  for (const f of (relFields ?? []) as any[]) {
    const source = nodeById.get(f.app_id);
    const targetId = f.config?.related_app_id as string | undefined;
    const target = targetId ? nodeById.get(targetId) : undefined;
    if (!source || !target) continue; // related app deleted or not visible

    const self = source.id === target.id;
    let x1 = 0, y1 = 0, x2 = 0, y2 = 0, lx = 0, ly = 0;
    if (!self) {
      const dx = target.cx - source.cx;
      const dy = target.cy - source.cy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      x1 = source.cx + ux * rectTrim(ux, uy);
      y1 = source.cy + uy * rectTrim(ux, uy);
      x2 = target.cx - ux * rectTrim(ux, uy);
      y2 = target.cy - uy * rectTrim(ux, uy);
      const pairKey = [source.id, target.id].sort().join("|");
      const dup = pairSeen.get(pairKey) ?? 0;
      pairSeen.set(pairKey, dup + 1);
      lx = (x1 + x2) / 2;
      ly = (y1 + y2) / 2 - 5 + dup * 14;
    }
    edges.push({
      key: f.id,
      sourceName: source.name,
      targetName: target.name,
      targetExternal: target.external,
      label: f.label ?? "relationship",
      self, x1, y1, x2, y2, lx, ly,
    });
  }
  const drawnEdges = edges.filter((e) => !e.self);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#333333]">Relationship map</h1>
        <Link
          href={`/org/${orgSlug}/${ws.slug}`}
          className="text-sm text-[#15808D] hover:underline"
        >
          ← {ws.name}
        </Link>
      </div>
      <p className="mt-1 text-sm text-[#8A9494]">
        {(apps ?? []).length} app{(apps ?? []).length === 1 ? "" : "s"} ·{" "}
        {edges.length} connection{edges.length === 1 ? "" : "s"}
        {externalIds.length > 0 &&
          ` · ${externalIds.length} external app${externalIds.length === 1 ? "" : "s"}`}
      </p>

      {n === 0 ? (
        <div className="mt-6 rounded border border-dashed border-[#B8C2C2] bg-white p-8 text-center text-sm text-[#8A9494]">
          No apps in this workspace yet — add an app first, then link apps
          together with relationship fields.
        </div>
      ) : (
        <div className="mt-6 rounded border border-[#E3E3E3] bg-white p-4 shadow-sm">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full"
            role="img"
            aria-label={`Relationship map of ${ws.name}`}
          >
            <defs>
              <marker
                id="rel-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#8A9494" />
              </marker>
            </defs>

            {drawnEdges.map((e) => (
              <line
                key={e.key}
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                stroke="#8A9494"
                strokeWidth={1.2}
                markerEnd="url(#rel-arrow)"
              />
            ))}
            {drawnEdges.map((e) => (
              <text
                key={`${e.key}-label`}
                x={e.lx}
                y={e.ly}
                textAnchor="middle"
                fontSize={11}
                fill="#8A9494"
                stroke="#FFFFFF"
                strokeWidth={4}
                paintOrder="stroke"
              >
                {truncate(e.label, 24)}
              </text>
            ))}

            {nodes.map((node) => {
              const box = (
                <g key={node.id}>
                  <rect
                    x={node.cx - NODE_W / 2}
                    y={node.cy - NODE_H / 2}
                    width={NODE_W}
                    height={NODE_H}
                    rx={4}
                    fill="#FFFFFF"
                    stroke={node.external ? "#B8C2C2" : "#15808D"}
                    strokeWidth={1.5}
                    strokeDasharray={node.external ? "4 3" : undefined}
                  />
                  <text
                    x={node.cx}
                    y={node.external ? node.cy : node.cy + 4.5}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={600}
                    fill={node.external ? "#6E7A7A" : "#15808D"}
                  >
                    {node.icon ? `${node.icon} ` : ""}
                    {truncate(node.name, 16)}
                  </text>
                  {node.external && (
                    <text
                      x={node.cx}
                      y={node.cy + 14}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#8A9494"
                    >
                      other workspace
                    </text>
                  )}
                  <title>{node.name}</title>
                </g>
              );
              return node.external ? (
                box
              ) : (
                <a key={node.id} href={`/org/${orgSlug}/${ws.slug}/${node.slug}`}>
                  {box}
                </a>
              );
            })}
          </svg>
          <div className="mt-3 flex items-center gap-5 border-t border-[#E3E3E3] pt-3 text-xs text-[#8A9494]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm border-[1.5px] border-[#15808D] bg-white" />
              App in this workspace
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm border-[1.5px] border-dashed border-[#B8C2C2] bg-white" />
              App in another workspace
            </span>
          </div>
        </div>
      )}

      {edges.length === 0 ? (
        n > 0 && (
          <div className="mt-6 rounded border border-dashed border-[#B8C2C2] bg-white p-8 text-center text-sm text-[#8A9494]">
            No connections yet. Add a <span className="font-semibold">relationship
            field</span> to an app to link its items to another app — each
            relationship field shows up here as an arrow between the two apps.
          </div>
        )
      ) : (
        <div className="mt-6 rounded border border-[#E3E3E3] bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#333333]">Connections</h2>
          <ul className="mt-2 space-y-1.5">
            {edges.map((e) => (
              <li key={e.key} className="text-sm text-[#6E7A7A]">
                <span className="font-semibold text-[#333333]">{e.sourceName}</span>
                {" —"}
                <span className="text-[#8A9494]">{e.label}</span>
                {"→ "}
                <span className="font-semibold text-[#333333]">{e.targetName}</span>
                {e.targetExternal && (
                  <span className="ml-1 text-xs text-[#8A9494]">(other workspace)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
