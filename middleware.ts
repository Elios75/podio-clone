import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the auth session on every request and guards app routes.
export async function middleware(request: NextRequest) {
  // White-label portals: map custom domains to /portal/<org-slug> (docs/PORTALS.md).
  // PORTAL_DOMAINS is JSON like {"clients.acme.com":"acme"}.
  if (process.env.PORTAL_DOMAINS && request.nextUrl.pathname === "/") {
    try {
      const domains: Record<string, string> = JSON.parse(process.env.PORTAL_DOMAINS);
      const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
      const slug = domains[host];
      if (slug) {
        const url = request.nextUrl.clone();
        url.pathname = `/portal/${slug}`;
        return NextResponse.rewrite(url);
      }
    } catch {
      // Malformed PORTAL_DOMAINS — ignore and fall through to normal routing.
    }
  }

  // Public REST API authenticates via API keys, not cookies
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/f/") || // public webforms
    request.nextUrl.pathname.startsWith("/portal/"); // public client portals

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
