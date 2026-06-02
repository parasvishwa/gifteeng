// ─── Footer ───────────────────────────────────────────────────────────────────
// Compact 4-column layout: Brand+Socials | My Account | Company | Contact
// Newsletter removed. Pure server component — no client state needed.
// Emil polish: specific-property transitions, active:scale, custom easing.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  Instagram, Facebook, Youtube, Linkedin,
  Mail, MessageCircle, MapPin,
} from "lucide-react";

// ── Static data ───────────────────────────────────────────────────────────────

const SOCIALS = [
  { label: "Facebook",  href: "https://facebook.com/gifteeng",         Icon: Facebook  },
  { label: "Instagram", href: "https://instagram.com/gifteeng",        Icon: Instagram },
  { label: "YouTube",   href: "https://youtube.com/@gifteeng",         Icon: Youtube   },
  { label: "LinkedIn",  href: "https://linkedin.com/company/gifteeng", Icon: Linkedin  },
];

const MY_ACCOUNT = [
  { label: "Login / Register", path: "/auth"    },
  { label: "Order History",    path: "/account" },
  { label: "Track Order",      path: "/track"   },
  { label: "Return Order",     path: "/returns" },
];

const COMPANY = [
  { label: "About Us",        path: "/about"   },
  { label: "Become a Seller", path: "/seller"      },
  { label: "Contact Us",      path: "/contact" },
  { label: "Gift Cards",      path: "/gift-cards" },
];

const POLICY_LINKS = [
  { label: "Privacy Policy",     path: "/privacy"  },
  { label: "Terms & Conditions", path: "/terms"    },
  { label: "Shipping Policy",    path: "/shipping" },
  { label: "Return Policy",      path: "/returns"  },
];

const PAYMENT_METHODS = ["UPI", "GPay", "PhonePe", "Visa", "Mastercard"];

// Specific-property transition — no transition-all
const TLink = "[transition:color_150ms_cubic-bezier(0.23,1,0.32,1),transform_150ms_cubic-bezier(0.23,1,0.32,1)]";
const TIcon = "[transition:color_160ms_cubic-bezier(0.23,1,0.32,1),background-color_160ms_cubic-bezier(0.23,1,0.32,1),transform_160ms_cubic-bezier(0.23,1,0.32,1)]";

// ── Footer ────────────────────────────────────────────────────────────────────
export function Footer() {
  return (
    <footer className="bg-[#0B0B0F] text-white">
      {/* Top accent */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      <div className="max-w-5xl mx-auto px-5 py-7">

        {/* ── Main row — Brand | My Account | Company | Contact ──────────── */}
        <div className="grid grid-cols-2 md:grid-cols-[1fr_auto_auto_auto] gap-x-10 gap-y-7">

          {/* Brand + Socials.
              `items-start` is required: the parent grid stretches the column
              wider than the logo, and without an explicit cross-axis
              alignment the SVG renders as a stretched block (visually
              "floating" toward column center). With items-start the logo
              hugs the left edge in line with the description + social row. */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-3 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/main-logo.svg"
              alt="Gifteeng"
              className="h-8 w-auto block opacity-90 hover:opacity-100 [transition:opacity_160ms_cubic-bezier(0.23,1,0.32,1)]"
            />
            <p className="text-white/40 text-[11px] leading-relaxed max-w-[220px]">
              Engineer Your Emotions. Premium personalized gifts delivered across India.
            </p>
            <div className="flex items-center gap-1.5">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.05] text-white/40 hover:bg-primary/15 hover:text-primary hover:scale-[1.08] active:scale-[0.95] ${TIcon}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
            </div>
          </div>

          {/* My Account */}
          <div>
            <h4 className="text-[9px] font-black uppercase tracking-[0.18em] text-white/28 mb-3">
              My Account
            </h4>
            <ul className="space-y-2">
              {MY_ACCOUNT.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.path}
                    className={`text-[11px] text-white/45 hover:text-primary hover:translate-x-0.5 inline-block active:scale-[0.97] ${TLink}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-[9px] font-black uppercase tracking-[0.18em] text-white/28 mb-3">
              Company
            </h4>
            <ul className="space-y-2">
              {COMPANY.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.path}
                    className={`text-[11px] text-white/45 hover:text-primary hover:translate-x-0.5 inline-block active:scale-[0.97] ${TLink}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-[9px] font-black uppercase tracking-[0.18em] text-white/28 mb-3">
              Contact
            </h4>
            <div className="flex flex-col gap-2.5">
              <a
                href="mailto:support@gifteeng.com"
                className={`flex items-center gap-2 text-[11px] text-white/45 hover:text-primary active:scale-[0.97] ${TIcon}`}
              >
                <Mail className="w-3 h-3 shrink-0" />
                support@gifteeng.com
              </a>
              <a
                href="https://wa.me/918070011777"
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 text-[11px] text-white/45 hover:text-primary active:scale-[0.97] ${TIcon}`}
              >
                <MessageCircle className="w-3 h-3 shrink-0" />
                +91 80 700 11 777
              </a>
              <span className="flex items-center gap-2 text-[11px] text-white/28">
                <MapPin className="w-3 h-3 shrink-0" />
                Kandivali, Mumbai
              </span>
            </div>
          </div>

        </div>

        {/* ── Divider ────────────────────────────────────────────────────── */}
        <div className="h-px bg-white/[0.06] my-5" />

        {/* ── Bottom bar ─────────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">

          {/* Payments */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <svg viewBox="0 0 24 24" className="w-3 h-3 text-[#528FF0]" fill="currentColor">
                <path d="M9.97 2L4.9 22h4.36l1.17-4.65h4.66L16.56 22h4.36L15.97 2H9.97zm.87 11.35L12.47 7h.06l1.63 6.35H10.84z" />
              </svg>
              <span className="text-[9px] text-white/30 font-medium">Secured by</span>
              <span className="text-[9px] font-bold text-[#528FF0]">Razorpay</span>
            </div>
            <div className="w-px h-3 bg-white/[0.1]" />
            {PAYMENT_METHODS.map((name) => (
              <span
                key={name}
                className="px-1.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06] text-[9px] text-white/30 font-medium"
              >
                {name}
              </span>
            ))}
          </div>

          {/* Policy + copyright */}
          <div className="flex flex-col items-start md:items-end gap-1">
            <div className="flex items-center gap-1 flex-wrap">
              {POLICY_LINKS.map((link, i) => (
                <span key={link.label} className="flex items-center gap-1">
                  <Link
                    href={link.path}
                    className="text-white/28 text-[9px] hover:text-primary [transition:color_150ms_cubic-bezier(0.23,1,0.32,1)]"
                  >
                    {link.label}
                  </Link>
                  {i < POLICY_LINKS.length - 1 && (
                    <span className="text-white/10 text-[8px]">·</span>
                  )}
                </span>
              ))}
            </div>
            <p className="text-white/15 text-[9px]">
              © {new Date().getFullYear()} Gifteeng. All Rights Reserved.
              <span className="text-white/10"> · Imazyn Ecommerce Pvt Ltd</span>
            </p>
          </div>

        </div>
      </div>
    </footer>
  );
}
