export const metadata = { title: "Offline — Podio Clone" };

// Static fallback page served by the service worker when a navigation fails.
export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-[#EDEDED] p-6">
      <div className="max-w-md rounded border border-[#E3E3E3] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-[#15808D]">
          You&apos;re offline
        </h1>
        <p className="mt-2 text-sm text-[#333333]">
          Reconnect to keep working. Drafts you typed are saved on this device.
        </p>
        <p className="mt-4 text-xs text-[#8A9494]">
          This page will go away as soon as your connection is back — just
          retry or hit reload.
        </p>
      </div>
    </main>
  );
}
