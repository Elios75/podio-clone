import { createClient } from "@supabase/supabase-js";

// iCalendar feed: subscribe from Google Calendar / Outlook via the tokenized URL.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "podio" }, auth: { persistSession: false } }
  );
  const { data: events, error } = await sb.rpc("calendar_feed", { p_token: token });
  if (error) {
    return new Response("Not found", { status: 404 });
  }

  const fmtDate = (d: string) =>
    new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const esc = (s: string) =>
    String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PodioClone//Calendar//EN",
    "X-WR-CALNAME:Podio Clone",
  ];
  for (const e of (events ?? []) as any[]) {
    if (!e.starts) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@podio-clone`,
      `DTSTAMP:${fmtDate(new Date().toISOString())}`,
      `DTSTART:${fmtDate(e.starts)}`,
      `SUMMARY:${esc(e.summary ?? "Untitled")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="podio-clone.ics"',
    },
  });
}
