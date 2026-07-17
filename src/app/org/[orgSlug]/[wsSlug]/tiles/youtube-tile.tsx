"use client";

import { useState } from "react";

// Extract the 11-char video id from any common YouTube URL shape; null if none.
export function parseYouTubeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);
  let candidate: string | null = null;

  if (host === "youtu.be") {
    candidate = segments[0] ?? null;
  } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    if (segments[0] === "watch") {
      candidate = parsed.searchParams.get("v");
    } else if (
      segments[0] === "shorts" ||
      segments[0] === "embed" ||
      segments[0] === "live"
    ) {
      candidate = segments[1] ?? null;
    }
  }

  if (candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate)) {
    return candidate;
  }
  return null;
}

export function YouTubeTile({
  url,
  title,
}: {
  url: string;
  title?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const id = parseYouTubeId(url);

  if (!id) {
    return (
      <div className="rounded border border-podio-border bg-podio-row-alt p-4 text-sm text-podio-meta">
        <p>Not a recognizable YouTube link.</p>
        <p className="truncate">{url}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative w-full overflow-hidden rounded border border-podio-border bg-black aspect-[16/9]">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={title ?? "YouTube video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Play video"
            className="group absolute inset-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt={title ?? "Video"}
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 group-hover:bg-black/85">
                <svg
                  viewBox="0 0 24 24"
                  fill="white"
                  className="h-7 w-7"
                  aria-hidden="true"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>
      {title ? (
        <div className="mt-1 truncate text-xs text-podio-meta">{title}</div>
      ) : null}
    </div>
  );
}
