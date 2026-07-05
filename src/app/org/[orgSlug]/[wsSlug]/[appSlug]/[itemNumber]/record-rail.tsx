"use client";

import { useState, type ReactNode } from "react";

// Right-rail Activity | Comments underline tabs (Podio record view).
// The tab contents are rendered server-side and passed in as ReactNode
// slots; inactive tab is hidden (not unmounted) so composer state survives.
export function RecordRail({
  defaultTab,
  activitySlot,
  commentsSlot,
}: {
  defaultTab: "activity" | "comments";
  activitySlot: ReactNode;
  commentsSlot: ReactNode;
}) {
  const [tab, setTab] = useState<"activity" | "comments">(defaultTab);

  const tabClass = (active: boolean) =>
    `-mb-px border-b-2 px-1 pb-2 text-sm font-semibold ${
      active
        ? "border-podio-teal text-podio-ink"
        : "border-transparent text-podio-secondary hover:text-podio-ink"
    }`;

  return (
    <div>
      <div className="flex items-center gap-5 border-b border-podio-border">
        <button
          type="button"
          className={tabClass(tab === "activity")}
          onClick={() => setTab("activity")}
        >
          Activity
        </button>
        <button
          type="button"
          className={tabClass(tab === "comments")}
          onClick={() => setTab("comments")}
        >
          Comments
        </button>
      </div>
      <div className={tab === "activity" ? "" : "hidden"}>{activitySlot}</div>
      <div className={tab === "comments" ? "" : "hidden"}>{commentsSlot}</div>
    </div>
  );
}
