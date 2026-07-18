import Link from "next/link";
import {
  Callout,
  CodeBlock,
  InlineCode,
  PageHeader,
  SectionHeading,
} from "./_components/docs";

const AREAS: { title: string; desc: string; href: string }[] = [
  {
    title: "Authentication",
    desc: "API keys with read/write scopes, plus OAuth2 (authorization code, refresh, app and password grants).",
    href: "/developers/authentication",
  },
  {
    title: "Applications",
    desc: "List apps and their field definitions (external_id, label, type) and workspaces with app counts.",
    href: "/developers/items#apps",
  },
  {
    title: "Items",
    desc: "CRUD, revisions and diffs, revert, clone, single-field updates and bulk delete.",
    href: "/developers/items#items",
  },
  {
    title: "Tasks",
    desc: "List, create and complete tasks with assignees and due dates.",
    href: "/developers/items#tasks",
  },
  {
    title: "Hooks",
    desc: "App-, field- and space-level webhooks with a verification handshake and delivery log.",
    href: "/developers/hooks",
  },
  {
    title: "Flows",
    desc: "Create and manage automation flows via API: triggers, effects, activate/deactivate, attribute discovery.",
    href: "/developers/flows",
  },
  {
    title: "Subscriptions & Notifications",
    desc: "Follow objects for change notifications; list and mark-read your notification inbox.",
    href: "/developers/flows#subscriptions",
  },
  {
    title: "Forms",
    desc: "Public webform submissions with optional Turnstile captcha.",
    href: "/developers/forms#forms",
  },
  {
    title: "Files & Export",
    desc: "Item PDF rendering, iCalendar feeds, inbound email, and XLSX export patterns.",
    href: "/developers/forms#files",
  },
  {
    title: "Rate limits",
    desc: "60 requests/minute per key, 429 semantics and the rate-limit response headers.",
    href: "/developers/authentication#rate-limits",
  },
];

export default function DevelopersPage() {
  return (
    <div>
      <PageHeader
        title="API documentation"
        lede={
          <>
            REST API v1.1 — programmatic access to apps, items, tasks, workspaces,
            hooks, flows, forms and notifications. All endpoints live under{" "}
            <InlineCode>/api</InlineCode> on your Podio Clone domain and accept and
            return JSON. Authenticate with an API key or an OAuth2 bearer token.
          </>
        }
      />

      <SectionHeading id="quickstart">Quick start</SectionHeading>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Create an API key in your organization settings (Settings → API keys),
        export it in your shell, and make your first call:
      </p>
      <CodeBlock>{`export BASE_URL="https://your-domain"
export PODIO_CLONE_KEY="pk_your_api_key"

curl "$BASE_URL/api/v1/apps" \\
  -H "Authorization: Bearer $PODIO_CLONE_KEY"`}</CodeBlock>
      <p className="mt-3 text-[15px] leading-relaxed text-podio-secondary">
        Every example in these docs is runnable as-is once{" "}
        <InlineCode>$BASE_URL</InlineCode> and{" "}
        <InlineCode>$PODIO_CLONE_KEY</InlineCode> are set. New to the API? Start
        with the{" "}
        <Link href="/developers/tutorials" className="text-podio-teal hover:underline">
          tutorials
        </Link>
        .
      </p>

      <SectionHeading id="areas">API areas</SectionHeading>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {AREAS.map((a) => (
          <Link
            key={a.title}
            href={a.href}
            className="group rounded border border-podio-border bg-white p-4 hover:border-podio-teal hover:bg-podio-row-alt"
          >
            <div className="text-[15px] font-semibold text-podio-teal group-hover:underline">
              {a.title}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-podio-secondary">
              {a.desc}
            </p>
          </Link>
        ))}
      </div>

      <SectionHeading id="best-practices">Best practices</SectionHeading>
      <Callout title="Build a good API citizen">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-podio-ink">Batch</strong> — create or delete
            many items in one call (bulk delete, one POST per item is a smell in a
            loop) instead of hammering single-item endpoints.
          </li>
          <li>
            <strong className="text-podio-ink">Cache</strong> — app and field
            definitions change rarely; cache <InlineCode>GET /api/v1/apps</InlineCode>{" "}
            instead of re-fetching it on every request.
          </li>
          <li>
            <strong className="text-podio-ink">Filter server-side</strong> — use{" "}
            <InlineCode>limit</InlineCode>/<InlineCode>offset</InlineCode> and query
            filters rather than pulling everything and filtering in your code.
          </li>
          <li>
            <strong className="text-podio-ink">Hooks, not polling</strong> —
            subscribe to <InlineCode>item.create</InlineCode>/
            <InlineCode>item.update</InlineCode> hooks instead of polling item lists
            on a timer.
          </li>
          <li>
            <strong className="text-podio-ink">Respect 429</strong> — on{" "}
            <InlineCode>429 Too Many Requests</InlineCode>, back off using the{" "}
            <InlineCode>Retry-After</InlineCode> and{" "}
            <InlineCode>X-RateLimit-*</InlineCode> headers; never retry in a tight
            loop.
          </li>
        </ul>
      </Callout>

      <SectionHeading id="recipes">Integration recipes</SectionHeading>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-podio-secondary">
        <p>
          <strong className="text-podio-ink">Slack / Microsoft Teams:</strong>{" "}
          create an incoming webhook in your Slack workspace or Teams channel, then
          add a &quot;Post to Slack / Teams&quot; action to any automation and paste the
          webhook URL. Messages send as{" "}
          <InlineCode>{'{"text": "…"}'}</InlineCode>, which both accept.
        </p>
        <p>
          <strong className="text-podio-ink">Zapier / Make (Integromat):</strong>{" "}
          use &quot;Webhooks by Zapier&quot; or the Make HTTP module.{" "}
          <em>Inbound to Podio Clone:</em> POST to an automation&apos;s inbound-webhook
          URL (create an automation with the &quot;Inbound webhook received&quot; trigger,
          copy its URL) or call the REST API with an API key.{" "}
          <em>Outbound from Podio Clone:</em> point a hook at your Zap/scenario&apos;s
          catch-hook URL — remember to complete the{" "}
          <Link href="/developers/hooks#handshake" className="text-podio-teal hover:underline">
            verification handshake
          </Link>{" "}
          first.
        </p>
        <p>
          <strong className="text-podio-ink">Stripe billing:</strong> set{" "}
          <InlineCode>STRIPE_SECRET_KEY</InlineCode>,{" "}
          <InlineCode>STRIPE_WEBHOOK_SECRET</InlineCode>,{" "}
          <InlineCode>STRIPE_PRICE_TEAM / _BUSINESS / _ENTERPRISE</InlineCode> and{" "}
          <InlineCode>STRIPE_RPC_PROOF</InlineCode> (matching the{" "}
          <InlineCode>stripe_rpc_proof</InlineCode> Vault secret), then point a
          Stripe webhook at <InlineCode>/api/billing/webhook</InlineCode> for{" "}
          <InlineCode>checkout.session.completed</InlineCode> and{" "}
          <InlineCode>customer.subscription.deleted</InlineCode>.
        </p>
      </div>
    </div>
  );
}
