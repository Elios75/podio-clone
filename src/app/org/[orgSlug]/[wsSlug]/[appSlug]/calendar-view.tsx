import Link from "next/link";

type CalCard = { href: string; title: string };

export function CalendarView({
  monthStr, // "YYYY-MM"
  cardsByDay,
  baseHref,
  viewQuery,
}: {
  monthStr: string;
  cardsByDay: Record<string, CalCard[]>;
  baseHref: string;
  viewQuery: string;
}) {
  const [year, month] = monthStr.split("-").map(Number); // month 1-12
  const first = new Date(Date.UTC(year, month - 1, 1));
  const monthName = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const prev = new Date(Date.UTC(year, month - 2, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  // Grid starts on the Sunday on/before the 1st
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const cells: { date: Date; iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    cells.push({
      date: d,
      iso: d.toISOString().slice(0, 10),
      inMonth: d.getUTCMonth() === month - 1,
    });
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          href={`${baseHref}?${viewQuery}&month=${fmt(prev)}`}
          className="rounded border border-podio-border bg-white px-2 py-1 text-sm text-podio-ink hover:bg-podio-row-hover"
        >
          ←
        </Link>
        <span className="text-[15px] font-semibold text-podio-ink">{monthName}</span>
        <Link
          href={`${baseHref}?${viewQuery}&month=${fmt(next)}`}
          className="rounded border border-podio-border bg-white px-2 py-1 text-sm text-podio-ink hover:bg-podio-row-hover"
        >
          →
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-7 overflow-hidden rounded border border-podio-border bg-white text-xs shadow-sm">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="border-b border-podio-border bg-podio-row-alt px-2 py-2 font-semibold text-podio-ink"
          >
            {d}
          </div>
        ))}
        {cells.map((cell) => (
          <div
            key={cell.iso}
            className={`min-h-24 border-b border-r border-[#EFEFEF] p-1.5 ${
              cell.inMonth ? "" : "bg-podio-row-alt text-podio-disabled"
            }`}
          >
            <span
              className={`text-[11px] ${
                cell.iso === todayIso
                  ? "rounded-full bg-podio-teal px-1.5 py-0.5 font-semibold text-white"
                  : "text-podio-meta"
              }`}
            >
              {cell.date.getUTCDate()}
            </span>
            <div className="mt-1 space-y-1">
              {(cardsByDay[cell.iso] ?? []).slice(0, 3).map((c, ci) => (
                <Link
                  key={ci}
                  href={c.href}
                  className="block truncate rounded bg-[#CDEDED] px-1.5 py-0.5 text-[11px] font-medium text-[#136570] hover:bg-[#BFE4E4]"
                >
                  {c.title}
                </Link>
              ))}
              {(cardsByDay[cell.iso] ?? []).length > 3 && (
                <p className="text-[10px] text-podio-meta">
                  +{(cardsByDay[cell.iso] ?? []).length - 3} more
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
