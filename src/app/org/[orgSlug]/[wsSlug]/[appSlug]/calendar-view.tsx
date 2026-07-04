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
          className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
        >
          ←
        </Link>
        <span className="text-sm font-medium">{monthName}</span>
        <Link
          href={`${baseHref}?${viewQuery}&month=${fmt(next)}`}
          className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100"
        >
          →
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-lg border border-slate-200 bg-white text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="border-b border-slate-200 bg-slate-50 px-2 py-2 font-medium uppercase tracking-wide text-slate-500"
          >
            {d}
          </div>
        ))}
        {cells.map((cell) => (
          <div
            key={cell.iso}
            className={`min-h-24 border-b border-r border-slate-100 p-1.5 ${
              cell.inMonth ? "" : "bg-slate-50 text-slate-300"
            }`}
          >
            <span
              className={`text-[11px] ${
                cell.iso === todayIso
                  ? "rounded-full bg-blue-600 px-1.5 py-0.5 font-semibold text-white"
                  : "text-slate-400"
              }`}
            >
              {cell.date.getUTCDate()}
            </span>
            <div className="mt-1 space-y-1">
              {(cardsByDay[cell.iso] ?? []).slice(0, 3).map((c, ci) => (
                <Link
                  key={ci}
                  href={c.href}
                  className="block truncate rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100"
                >
                  {c.title}
                </Link>
              ))}
              {(cardsByDay[cell.iso] ?? []).length > 3 && (
                <p className="text-[10px] text-slate-400">
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
