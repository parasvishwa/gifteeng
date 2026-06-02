import type { Metadata } from "next";
import Link from "next/link";
import { Trash2, ShieldCheck, Clock, FileDown, Mail, ArrowRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Public, top-level account-deletion page.
//
// Both the App Store and Play Store require a discoverable URL where users
// (including non-customers) can read about, and request, account deletion
// without first having to log in. The actual delete flow lives at
// /b2c/account/privacy and requires authentication — this page documents
// the policy and links to it.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Delete Your Account – Gifteeng",
  description:
    "How to delete your Gifteeng account and what data we keep, anonymise, or remove. Required by Apple App Store and Google Play.",
  alternates: { canonical: "https://www.gifteeng.com/account-deletion" },
};

export default function AccountDeletionPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="bg-muted/40 py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary/10 mb-6">
            <Trash2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-black mb-4 tracking-tight">
            Delete your account
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg">
            You can request deletion of your Gifteeng account at any time. Here&apos;s how it works
            and exactly what happens to your data.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-3xl px-4 space-y-10">
          {/* How to request deletion */}
          <div>
            <h2 className="font-display text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> How to request deletion
            </h2>
            <div className="space-y-3 text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">From the app or website (recommended):</strong>{" "}
                sign in, go to <Link href="/account/privacy" className="text-primary underline">Account → Privacy &amp; Data Controls</Link>{" "}
                and tap <em>Schedule deletion</em>. Your account is queued for deletion 30 days from
                the request — you can cancel any time before that window expires by visiting the
                same page.
              </p>
              <p>
                <strong className="text-foreground">By email:</strong>{" "}
                if you can&apos;t sign in, email{" "}
                <a className="text-primary underline" href="mailto:privacy@gifteeng.com?subject=Account%20deletion%20request">privacy@gifteeng.com</a>{" "}
                from the address registered to your account, with the subject{" "}
                <em>&ldquo;Account deletion request&rdquo;</em>. We respond within 7 days and complete
                the deletion within the standard 30-day window.
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <h2 className="font-display text-xl md:text-2xl font-bold mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" /> Timeline
            </h2>
            <ol className="space-y-3 text-muted-foreground">
              <li className="flex gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">1</span>
                <div>
                  <strong className="text-foreground">Day 0 — Request submitted.</strong> Your
                  account is marked for deletion. You can still log in and cancel.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">2</span>
                <div>
                  <strong className="text-foreground">Days 1-30 — Grace window.</strong> We hold the
                  request to allow refunds, returns, or any in-flight orders to complete cleanly.
                  Cancel at any time from your account page.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">3</span>
                <div>
                  <strong className="text-foreground">Day 30 — Anonymisation runs.</strong> An
                  automated job redacts all personally identifying data and sends you a confirmation
                  email. The action is irreversible after this point.
                </div>
              </li>
            </ol>
          </div>

          {/* What we delete vs keep */}
          <div>
            <h2 className="font-display text-xl md:text-2xl font-bold mb-4">
              What we delete and what we keep
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-3">
                  Permanently anonymised
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Name, email, phone number</li>
                  <li>• Saved addresses</li>
                  <li>• Profile photo and avatar</li>
                  <li>• Customisation photos and uploaded images</li>
                  <li>• Wishlist and saved preferences</li>
                  <li>• Push notification tokens</li>
                  <li>• Gift reminder records</li>
                  <li>• Google account linkage (if any)</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-3">
                  Kept for legal compliance
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>
                    • <strong className="text-foreground">Order records</strong> — kept for 7 years per
                    Indian GST and Income Tax Act requirements, with all personal information redacted.
                  </li>
                  <li>
                    • <strong className="text-foreground">Reviews</strong> you posted publicly — the text
                    stays, but the author name displays as &ldquo;Anonymous&rdquo;.
                  </li>
                  <li>
                    • <strong className="text-foreground">Consent audit log</strong> — required by
                    DPDP for regulator queries, contains no PII after redaction.
                  </li>
                  <li>
                    • <strong className="text-foreground">Aggregated analytics</strong> — counts and
                    trends with no link back to you.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Data export reminder */}
          <div className="rounded-2xl border border-border bg-muted/30 p-5">
            <h2 className="font-display text-base font-bold mb-2 flex items-center gap-2">
              <FileDown className="w-4 h-4 text-primary" /> Want a copy first?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Before deleting, you can download everything we hold about you as a JSON file.
              Sign in and visit{" "}
              <Link href="/account/privacy" className="text-primary underline">
                Account → Privacy &amp; Data Controls → Download my data
              </Link>
              .
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/account/privacy"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90"
            >
              Manage my account <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:privacy@gifteeng.com?subject=Account%20deletion%20request"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted/50"
            >
              <Mail className="w-4 h-4" /> Email privacy@gifteeng.com
            </a>
          </div>

          <p className="text-center text-[11px] text-muted-foreground pt-4 border-t border-border">
            Operated by Imazyn Ecommerce Pvt Ltd · Brand: Gifteeng ·{" "}
            <Link href="/privacy" className="underline">Full Privacy Policy</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
