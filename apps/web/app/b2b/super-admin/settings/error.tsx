"use client";

// Route-level error boundary for /super-admin/settings.
//
// The settings page was throwing a client-side exception in production and
// Next.js's default fallback only said "Application error: a client-side
// exception has occurred" with no stack trace, so we couldn't tell where.
// This boundary surfaces the actual message + stack so the admin can copy
// it out (or screenshot) for us to fix. It also offers a Try-again button
// since most runtime errors here are transient (stale auth token, race on
// a state read, etc).

import { useEffect } from "react";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log to the browser console too — a DevTools-savvy admin will see the
  // full traceback there even if they don't read the on-page details.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[/super-admin/settings] runtime error:", error);
  }, [error]);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <h2 className="text-base font-bold text-red-700 mb-2">
          Settings page failed to load
        </h2>
        <p className="text-sm text-red-700/80 mb-3">
          A runtime error stopped the page from rendering. Details below — copy this and ping support.
        </p>
        <pre className="text-[11px] font-mono bg-white border border-red-200 rounded-md p-3 overflow-auto max-h-72 whitespace-pre-wrap text-red-900">
          {error.message}
          {"\n\n"}
          {error.stack ?? "(no stack)"}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700"
          >
            Try again
          </button>
          <a
            href="/super-admin"
            className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-xs font-bold hover:bg-red-100"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
