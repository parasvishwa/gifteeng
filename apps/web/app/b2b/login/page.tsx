import { Suspense } from "react";
import { B2BLoginForm } from "./_components/B2BLoginForm";

export const dynamic = "force-dynamic";

export default function B2BLoginPage() {
  return (
    <div
      className="fixed inset-0 top-[48px] flex items-center justify-center px-4"
      style={{ background: "linear-gradient(160deg,#09090f 0%,#0f0a1e 50%,#09090f 100%)", zIndex: 10 }}
    >
      {/* Ambient glow blobs — server-rendered, visible immediately */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 opacity-20 rounded-full"
          style={{ background: "radial-gradient(circle, #ec4899 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 opacity-15 rounded-full"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 opacity-10 rounded-full"
          style={{ background: "radial-gradient(circle, #ec4899 0%, transparent 70%)", filter: "blur(80px)" }} />
      </div>
      <Suspense fallback={null}>
        <B2BLoginForm />
      </Suspense>
    </div>
  );
}
