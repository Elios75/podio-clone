import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConsentForm from "./consent-form";

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  read: "Read your organizations, apps, and items",
  write: "Create, update, and delete items on your behalf",
};

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const clientId = typeof params.client_id === "string" ? params.client_id : "";
  const redirectUri =
    typeof params.redirect_uri === "string" ? params.redirect_uri : "";
  const scope = typeof params.scope === "string" ? params.scope : "read";
  const state = typeof params.state === "string" ? params.state : "";
  const scopes = scope.split(/\s+/).filter(Boolean);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const qs = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      ...(state ? { state } : {}),
    });
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
  }

  let clientName: string | null = null;
  let problem: string | null = null;

  if (!clientId || !redirectUri) {
    problem = "Missing client_id or redirect_uri.";
  } else {
    const { data, error } = await supabase.rpc("oauth_client_info", {
      p_client_id: clientId,
      p_redirect_uri: redirectUri,
    });
    if (error || !data) {
      problem = "Unknown application (invalid client_id).";
    } else if (!data.redirect_ok) {
      problem = "The redirect URI is not registered for this application.";
    } else {
      clientName = data.name as string;
    }
  }

  return (
    <div className="min-h-screen bg-podio-page px-4 pt-16">
      <div className="mx-auto w-full max-w-md rounded border border-podio-border bg-white">
        <div className="border-b border-podio-border px-6 py-4">
          <h1 className="text-lg font-semibold text-podio-teal">
            {problem ? "Authorization error" : `Authorize ${clientName}`}
          </h1>
        </div>

        {problem ? (
          <div className="px-6 py-5">
            <p className="text-sm text-podio-ink">{problem}</p>
            <p className="mt-2 text-xs text-podio-meta">
              Close this window and contact the application developer.
            </p>
          </div>
        ) : (
          <div className="px-6 py-5">
            <p className="text-sm text-podio-ink">
              <span className="font-semibold">{clientName}</span> is requesting
              access to your account
              {user!.email ? (
                <>
                  {" "}
                  (<span className="text-podio-secondary">{user!.email}</span>)
                </>
              ) : null}
              .
            </p>

            <ul className="mt-4 space-y-2 border-y border-podio-border py-4">
              {(scopes.length ? scopes : ["read"]).map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-podio-teal">✓</span>
                  <span className="text-podio-ink">
                    <span className="font-medium">{s}</span>
                    <span className="text-podio-meta">
                      {" — "}
                      {SCOPE_DESCRIPTIONS[s] ?? "Custom scope"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <ConsentForm
              clientId={clientId}
              redirectUri={redirectUri}
              scopes={scopes.length ? scopes : ["read"]}
              state={state}
            />

            <p className="mt-4 text-xs text-podio-meta">
              You will be redirected to {redirectUri}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
