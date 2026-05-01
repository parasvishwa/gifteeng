"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Instagram,
  Facebook,
  Youtube,
  Linkedin,
  Mail,
  MessageCircle,
  MapPin,
  User,
  Package,
  CreditCard,
  Gift,
  Building2,
  RotateCcw,
} from "lucide-react";

function showToast(msg: string, ok = true) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = msg;
  el.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:${ok ? "#059669" : "#dc2626"};box-shadow:0 4px 16px rgba(0,0,0,0.2);animation:tfIn .2s ease;pointer-events:none;`;
  if (!document.getElementById("tf-style")) {
    const s = document.createElement("style");
    s.id = "tf-style";
    s.textContent = "@keyframes tfIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}";
    document.head.appendChild(s);
  }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const iconMap: Record<string, React.ElementType> = {
  Facebook,
  Instagram,
  Youtube,
  Linkedin,
  Mail,
  MessageCircle,
  MapPin,
  User,
  Package,
  CreditCard,
  Gift,
  Building2,
  RotateCcw,
};

interface FooterSettings {
  brand_description: string;
  email: string;
  whatsapp: string;
  whatsapp_display: string;
  address: string;
  social_links: { label: string; url: string; icon: string; enabled: boolean }[];
  support_links: { label: string; url: string; icon: string; enabled: boolean }[];
  columns: { title: string; links: { label: string; path: string; icon?: string }[] }[];
  policy_links: { label: string; path: string }[];
  payment_gateways: { name: string; enabled: boolean }[];
  payment_title: string;
  copyright_company: string;
  copyright_text: string;
}

const DEFAULTS: FooterSettings = {
  brand_description:
    "Engineer Your Emotions. Premium personalized gifts delivered across India.",
  email: "support@gifteeng.com",
  whatsapp: "918070011777",
  whatsapp_display: "+91 80 700 11 777",
  address: "Kandivali, Mumbai",
  social_links: [
    { label: "Facebook", url: "https://facebook.com/gifteeng", icon: "Facebook", enabled: true },
    { label: "Instagram", url: "https://instagram.com/gifteeng", icon: "Instagram", enabled: true },
    { label: "YouTube", url: "https://youtube.com/@gifteeng", icon: "Youtube", enabled: true },
    { label: "LinkedIn", url: "https://linkedin.com/company/gifteeng", icon: "Linkedin", enabled: true },
  ],
  support_links: [
    { label: "Email", url: "mailto:support@gifteeng.com", icon: "Mail", enabled: true },
    { label: "WhatsApp", url: "https://wa.me/918070011777", icon: "MessageCircle", enabled: true },
  ],
  columns: [
    {
      title: "My Account",
      links: [
        { label: "Login / Register", path: "/b2c/auth" },
        { label: "Order History", path: "/b2c/account" },
        { label: "Track Order", path: "/b2c/track" },
        { label: "Return Order", path: "/b2c/returns" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About Us", path: "/b2c/about" },
        { label: "Corporate Orders", path: "/b2c/corporate" },
        { label: "Become a Vendor", path: "/b2c/become-a-vendor" },
        { label: "Contact Us", path: "/b2c/contact" },
        { label: "Gift Cards", path: "/b2c/gift-cards" },
      ],
    },
  ],
  policy_links: [
    { label: "Privacy Policy", path: "/b2c/privacy" },
    { label: "Terms & Conditions", path: "/b2c/terms" },
    { label: "Shipping Policy", path: "/b2c/shipping" },
    { label: "Return Policy", path: "/b2c/returns" },
  ],
  payment_gateways: [
    { name: "Razorpay", enabled: true },
    { name: "UPI", enabled: true },
    { name: "GPay", enabled: true },
    { name: "PhonePe", enabled: true },
    { name: "Visa", enabled: true },
    { name: "Mastercard", enabled: true },
  ],
  payment_title: "Secure Payments",
  copyright_company: "Imazyn Ecommerce Pvt Ltd",
  copyright_text: "© 2025 Gifteeng. All Rights Reserved.",
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function Footer() {
  const [settings] = useState<FooterSettings>(DEFAULTS);
  const [email, setEmail] = useState("");
  const [subState, setSubState] = useState<"idle" | "loading" | "done">("idle");

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || subState !== "idle") return;
    setSubState("loading");
    try {
      const r = await fetch(`${API_BASE}/api/notifications/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (r.ok) {
        setSubState("done");
        showToast("You're subscribed! 🎉");
        setEmail("");
      } else {
        setSubState("idle");
        showToast("Already subscribed or invalid email.", false);
      }
    } catch {
      setSubState("idle");
      showToast("Couldn't subscribe right now. Try again.", false);
    }
  };

  const s = settings;
  const activeSocials = s.social_links.filter((l) => l.enabled);
  const activePayments = s.payment_gateways.filter((p) => p.enabled);

  return (
    <footer className="bg-[#0B0B0F] text-white pb-0">
      {/* Top accent line */}
      <div className="h-0.5 bg-[#EF3752]/40" />

      <div className="max-w-5xl mx-auto px-5 pt-10 pb-6">
        {/* Main row — brand left, links right. Stacks on mobile */}
        <div className="flex flex-col md:flex-row md:items-start gap-8 md:gap-12">

          {/* ── Brand ── */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left md:min-w-[240px] md:max-w-[270px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/main-logo.svg"
              alt="Gifteeng"
              className="h-9 mb-3"
            />
            <p className="text-white/50 text-xs leading-relaxed mb-5 max-w-[260px]">
              {s.brand_description}
            </p>

            {/* Contact pills */}
            <div className="flex flex-col items-center md:items-start gap-2 mb-5 w-full">
              <a
                href={`mailto:${s.email}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs text-white/60 hover:text-primary hover:border-primary/20 transition-all"
              >
                <Mail className="w-3.5 h-3.5 shrink-0" /> {s.email}
              </a>
              <a
                href={`https://wa.me/${s.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-xs text-white/60 hover:text-primary hover:border-primary/20 transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" /> {s.whatsapp_display}
              </a>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-white/40">
                <MapPin className="w-3.5 h-3.5 shrink-0" /> {s.address}
              </span>
            </div>

            {/* Social icons */}
            {activeSocials.length > 0 && (
              <div className="flex items-center gap-1">
                {activeSocials.map((social) => {
                  const Icon = iconMap[social.icon] || Mail;
                  return (
                    <a
                      key={social.label}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.label}
                      className="w-9 h-9 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-primary/15 text-white/50 hover:text-primary transition-all duration-200"
                    >
                      <Icon className="w-4 h-4" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Divider mobile ── */}
          <div className="border-t border-white/5 md:hidden" />

          {/* ── Link columns ── */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-6 flex-1">
            {s.columns.map((col, ci) => (
              <div key={ci}>
                <h4 className="font-semibold text-[11px] text-white/60 uppercase tracking-[0.14em] mb-3">
                  {col.title}
                </h4>
                <ul className="space-y-2.5">
                  {col.links.map((link, li) => (
                    <li key={li}>
                      <Link
                        href={link.path}
                        className="text-white/50 text-xs hover:text-primary transition-colors duration-200 hover:translate-x-0.5 inline-block"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.08]">
        <div className="max-w-5xl mx-auto px-5 py-5">
          {/* Payments — horizontal pill strip */}
          {activePayments.length > 0 && (
            <div className="flex flex-col items-center gap-2.5 mb-4">
              {/* Razorpay branding */}
              <div className="flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-[#528FF0]"
                  fill="currentColor"
                >
                  <path d="M9.97 2L4.9 22h4.36l1.17-4.65h4.66L16.56 22h4.36L15.97 2H9.97zm.87 11.35L12.47 7h.06l1.63 6.35H10.84z" />
                </svg>
                <span className="text-[10px] text-white/50 font-semibold tracking-wide">
                  Secure Payments by
                </span>
                <span className="text-[11px] font-bold text-[#528FF0] tracking-tight">
                  Razorpay
                </span>
              </div>
              {/* Payment method pills */}
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                {activePayments
                  .filter((p) => p.name !== "Razorpay")
                  .map((p) => (
                    <span
                      key={p.name}
                      className="px-2.5 py-1 rounded-full bg-white/[0.06] text-[10px] text-white/50 font-medium border border-white/[0.06]"
                    >
                      {p.name}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="h-px bg-white/[0.06] mb-4" />

          {/* Policies row + company info — single compact row */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {s.policy_links.map((link, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <Link
                    href={link.path}
                    className="text-white/40 text-[10px] hover:text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                  {i < s.policy_links.length - 1 && (
                    <span className="text-white/15 text-[8px]">·</span>
                  )}
                </span>
              ))}
            </div>
            <p className="text-white/25 text-[10px] text-center">
              {s.copyright_text}
              {s.copyright_company && (
                <span className="text-white/15"> · {s.copyright_company}</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
