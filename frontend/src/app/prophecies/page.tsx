"use client";

export default function PropheciesPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
      <h1 className="text-3xl font-bold">Prophecy Oracle</h1>
      <div className="border border-gray-800 rounded-xl p-6 bg-[#0d0d0d]">
        <p className="text-sm text-gray-400">
          Prophecy generation is disabled at runtime in the cult-first
          governance refactor.
        </p>
      </div>

      {/* PROPHECY_DISABLED_START
      Previous active implementation kept for future re-enable:
      - Poll /api/prophecies
      - Render fulfillment stats (active/resolved/accuracy)
      - Display feed with ProphecyFeed component
      PROPHECY_DISABLED_END */}
    </div>
  );
}
