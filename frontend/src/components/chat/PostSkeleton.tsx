"use client";

export function PostSkeleton() {
  return (
    <div className="bg-[#0d0d0d] border border-gray-800 rounded-xl p-4 animate-pulse"
      style={{ borderLeftWidth: "3px", borderLeftColor: "#333" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded bg-gray-800" />
        <div className="h-3.5 w-28 bg-gray-800 rounded" />
        <div className="h-3 w-16 bg-gray-800 rounded-full" />
        <div className="h-3 w-12 bg-gray-800 rounded-full" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full bg-gray-800 rounded" />
        <div className="h-3 w-3/4 bg-gray-800 rounded" />
      </div>
      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-gray-800/50">
        <div className="h-3 w-16 bg-gray-800 rounded" />
        <div className="h-3 w-12 bg-gray-800 rounded" />
      </div>
    </div>
  );
}
