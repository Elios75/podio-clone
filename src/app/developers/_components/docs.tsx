import Link from "next/link";

/* Shared server-rendered building blocks for the /developers docs hub.
   Styling follows docs/design/podio-design-skill/references/tokens.md:
   podio token classes, 4px radii, 15px body, no blue. */

const METHOD_CHIP: Record<string, string> = {
  // Pastel chip system from tokens.md — no blue anywhere.
  GET: "bg-[#CDEDED] text-[#136570]",
  POST: "bg-[#D9F2E5] text-[#1C7A4D]",
  PUT: "bg-[#F5EFC8] text-[#7A6A1C]",
  PATCH: "bg-[#F5EFC8] text-[#7A6A1C]",
  DELETE: "bg-[#F9D7D4] text-[#A33B33]",
};

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
        METHOD_CHIP[method] ?? "bg-podio-row-alt text-podio-secondary"
      }`}
    >
      {method}
    </span>
  );
}

export type EndpointRow = {
  method: string;
  path: string;
  params?: string;
  response?: string;
};

export function EndpointTable({ rows }: { rows: EndpointRow[] }) {
  return (
    <div className="overflow-x-auto rounded border border-podio-border bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-podio-row-alt text-xs font-semibold uppercase tracking-wide text-podio-secondary">
            <th className="px-3 py-2">Verb</th>
            <th className="px-3 py-2">Path</th>
            <th className="px-3 py-2">Params / body</th>
            <th className="px-3 py-2">Response</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.method}-${r.path}-${i}`}
              className="border-t border-podio-border align-top hover:bg-podio-row-hover"
            >
              <td className="px-3 py-2.5 whitespace-nowrap">
                <MethodBadge method={r.method} />
              </td>
              <td className="px-3 py-2.5">
                <code className="text-[13px] font-medium text-podio-ink">{r.path}</code>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-podio-secondary">
                {r.params ?? "—"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-podio-secondary">
                {r.response ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CodeBlock({
  children,
  label,
}: {
  children: string;
  label?: string;
}) {
  return (
    <div className="mt-3">
      {label ? (
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-podio-meta">
          {label}
        </div>
      ) : null}
      <pre className="overflow-x-auto rounded bg-[#2E3636] p-4 text-[12.5px] leading-relaxed text-[#E8EDED]">
        {children}
      </pre>
    </div>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-podio-row-alt px-1 py-0.5 text-[13px] text-podio-ink">
      {children}
    </code>
  );
}

export function Callout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded border border-podio-border border-l-4 border-l-podio-teal bg-white p-4">
      <div className="text-[15px] font-semibold text-podio-ink">{title}</div>
      <div className="mt-1.5 text-[15px] leading-relaxed text-podio-secondary">
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  lede,
}: {
  title: string;
  lede: React.ReactNode;
}) {
  return (
    <header className="border-b border-podio-border pb-5">
      <h1 className="text-[22px] font-semibold text-podio-ink">{title}</h1>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-podio-secondary">
        {lede}
      </p>
    </header>
  );
}

export function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="mt-10 scroll-mt-20 border-b border-podio-border pb-2 text-[18px] font-semibold text-podio-ink"
    >
      {children}
    </h2>
  );
}

export function DocsLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="text-podio-teal hover:underline">
      {children}
    </Link>
  );
}

/* "Test console" affordance: a filled-in curl request with env-var
   placeholders plus the expected JSON response, side by side. */
export function TryIt({
  request,
  response,
}: {
  request: string;
  response: string;
}) {
  return (
    <div className="mt-3 rounded border border-podio-border bg-white">
      <div className="flex items-center gap-2 border-b border-podio-border bg-podio-row-alt px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-podio-secondary">
          Try it
        </span>
        <span className="text-xs text-podio-meta">
          uses $BASE_URL and $PODIO_CLONE_KEY from your shell
        </span>
      </div>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed text-podio-ink">
        {request}
      </pre>
      <div className="border-t border-podio-border bg-podio-row-alt px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-podio-secondary">
        Expected response
      </div>
      <pre className="overflow-x-auto rounded-b bg-[#2E3636] p-4 text-[12.5px] leading-relaxed text-[#E8EDED]">
        {response}
      </pre>
    </div>
  );
}
