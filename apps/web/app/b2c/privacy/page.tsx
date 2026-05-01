import type { Metadata } from "next";
import Link from "next/link";
import { Shield, Lock, Eye, UserCheck, Bell, Mail, Cookie, Smartphone, type LucideIcon } from "lucide-react";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Privacy Policy – Gifteeng",
  description:
    "Understand how Gifteeng collects, uses, and protects your personal information — including phone OTP, Goins loyalty data, and payment handling.",
};

type Section = {
  id: string;
  icon?: LucideIcon;
  title: string;
  content: string[];
  list?: { bold?: string; text: string }[];
};

const SECTIONS: Section[] = [
  {
    id: "overview",
    icon: Shield,
    title: "1. Overview",
    content: [
      "Imazyn Ecommerce Pvt Ltd (\"Gifteeng\", \"we\", \"our\") operates www.gifteeng.com and related mobile applications. This Privacy Policy explains what data we collect, why we collect it, and how we use and protect it.",
      "By using our platform, you consent to the practices described in this policy. If you do not agree, please discontinue use of our services.",
      "This policy was last updated in April 2025. We may update it periodically; continued use after an update constitutes acceptance.",
    ],
  },
  {
    id: "information-collected",
    icon: Eye,
    title: "2. Information We Collect",
    content: [
      "We collect information you provide directly and data generated automatically when you use our platform.",
    ],
    list: [
      {
        bold: "Phone Number & OTP:",
        text: "We collect your mobile phone number for authentication. A one-time password (OTP) is sent via SMS (Twilio or similar provider) to verify your identity. We do not share your number for marketing purposes without consent.",
      },
      {
        bold: "Profile Information:",
        text: "Name, email address, and delivery addresses you add to your account.",
      },
      {
        bold: "Transaction Data:",
        text: "Orders placed, products purchased, payment method type (not card numbers), and order status history.",
      },
      {
        bold: "Goins & Loyalty Data:",
        text: "Your Goins balance, earning and redemption history, spin wheel / Pick Me! game results, referral records, and review activity.",
      },
      {
        bold: "Customisation Content:",
        text: "Images, text, and designs you upload for custom product creation. These are stored securely and used solely to fulfil your order.",
      },
      {
        bold: "Device & Usage Data:",
        text: "IP address, browser type, operating system, pages visited, session duration, referring URL, and timestamps. Collected automatically via server logs and analytics tools.",
      },
      {
        bold: "Cookies & Local Storage:",
        text: "We use cookies and browser local storage for authentication tokens, cart persistence, theme preference, and analytics. See Section 6 for details.",
      },
      {
        bold: "WhatsApp Business:",
        text: "If you contact us or opt-in to notifications via WhatsApp, your WhatsApp number and message content are processed through the WhatsApp Business API. WhatsApp's privacy policy also applies.",
      },
      {
        bold: "Payment Information:",
        text: "Payments are processed by Razorpay. We do not receive or store your card number, CVV, or net banking credentials. We receive only a transaction ID, payment status, and masked card/UPI identifier.",
      },
    ],
  },
  {
    id: "how-we-use",
    icon: Lock,
    title: "3. How We Use Your Information",
    content: ["We use the information collected for the following purposes:"],
    list: [
      { bold: "Authentication:", text: "Verifying your identity via phone OTP to secure your account." },
      { bold: "Order Fulfilment:", text: "Processing, packing, dispatching, and tracking your orders." },
      { bold: "Personalisation:", text: "Tailoring product recommendations, homepage content, and Goins offers based on your purchase history and preferences." },
      { bold: "Goins Programme:", text: "Tracking your Goins balance, game results, referrals, and redemptions." },
      { bold: "Customer Support:", text: "Responding to queries via email, WhatsApp, or phone." },
      { bold: "Communications:", text: "Sending order confirmations, dispatch notifications, and (with consent) promotional messages via SMS, WhatsApp, or email." },
      { bold: "Analytics & Improvement:", text: "Understanding how users navigate our platform to improve design, performance, and product offerings." },
      { bold: "Fraud Prevention:", text: "Detecting and preventing fraudulent orders, account exploits, and abuse of loyalty programmes." },
      { bold: "Legal Compliance:", text: "Meeting our obligations under Indian law, including tax, GST, and consumer protection requirements." },
    ],
  },
  {
    id: "sharing",
    icon: UserCheck,
    title: "4. How We Share Your Information",
    content: ["We do not sell your personal data. We share it only in the following circumstances:"],
    list: [
      {
        bold: "Logistics Partners:",
        text: "Your name, address, and phone number are shared with our shipping and courier partners (e.g., Delhivery, Bluedart, Shiprocket) to enable delivery.",
      },
      {
        bold: "Payment Processor:",
        text: "Transaction data is shared with Razorpay to process payments securely.",
      },
      {
        bold: "SMS & Communication Providers:",
        text: "Your phone number is shared with SMS gateway providers (e.g., Twilio, MSG91) solely for OTP delivery and order notifications.",
      },
      {
        bold: "Analytics Providers:",
        text: "Aggregated, anonymised usage data may be shared with analytics platforms (e.g., Google Analytics). Individual identities are not shared.",
      },
      {
        bold: "Legal Requirements:",
        text: "We may disclose your data to government authorities, courts, or law enforcement when required by applicable law or a valid legal order.",
      },
      {
        bold: "Business Transactions:",
        text: "In the event of a merger, acquisition, or sale of assets, your data may be transferred to the acquiring entity, subject to equivalent privacy protections.",
      },
    ],
  },
  {
    id: "security",
    icon: Shield,
    title: "5. Data Security",
    content: [
      "We implement industry-standard security measures to protect your data, including HTTPS encryption for all data in transit, secure server infrastructure, access controls, and regular security reviews.",
      "Payment data is handled exclusively by Razorpay's PCI-DSS Level 1 compliant infrastructure. We never store raw card details.",
      "However, no system is completely secure. While we take all reasonable precautions, we cannot guarantee absolute security of data transmitted over the internet.",
    ],
  },
  {
    id: "cookies",
    icon: Cookie,
    title: "6. Cookies & Local Storage",
    content: [
      "We use the following technologies to enhance your experience:",
    ],
    list: [
      { bold: "Authentication token:", text: "Stored in localStorage to keep you logged in across sessions." },
      { bold: "Cart data:", text: "Stored in localStorage so your cart persists between sessions and devices." },
      { bold: "Theme preference:", text: "Light/dark mode preference stored locally." },
      { bold: "Analytics cookies:", text: "Used to measure site traffic and user behaviour (e.g., Google Analytics). You can opt out via your browser settings or Google's opt-out tool." },
      { bold: "Session cookies:", text: "Short-lived cookies to maintain your browsing session." },
    ],
  },
  {
    id: "notifications",
    icon: Smartphone,
    title: "7. Communication Preferences",
    content: [
      "We may send you communications via SMS, WhatsApp, and email for:",
    ],
    list: [
      { text: "Order confirmations, dispatch notifications, and delivery updates (transactional — cannot be opted out of)" },
      { text: "OTP messages for authentication" },
      { text: "Goins earned/redeemed notifications" },
      { text: "Promotional offers, new product launches, and seasonal campaigns (can be opted out of)" },
    ],
  },
  {
    id: "third-party",
    icon: Bell,
    title: "8. Third-Party Links",
    content: [
      "Our platform may contain links to third-party websites (e.g., social media, partner brands). We are not responsible for the privacy practices of these sites. We encourage you to read their respective privacy policies.",
    ],
  },
  {
    id: "children",
    title: "9. Children's Privacy",
    content: [
      "Our services are not intended for individuals under 13 years of age. We do not knowingly collect personal data from children. If we discover that we have inadvertently collected data from a child, we will delete it promptly. If you believe a child has provided us with personal information, please contact us at support@gifteeng.com.",
    ],
  },
  {
    id: "retention",
    title: "10. Data Retention",
    content: [
      "We retain your data for as long as your account is active or as required to fulfil the purposes described in this policy. Order records are retained for 7 years as required by Indian tax law (GST). Customisation uploads are deleted 6 months after order completion. You may request deletion of your account at any time (see Section 11).",
    ],
  },
  {
    id: "rights",
    icon: Mail,
    title: "11. Your Rights",
    content: [
      "Under applicable Indian law (including the Digital Personal Data Protection Act, 2023, when in force), you have the right to:",
    ],
    list: [
      { bold: "Access:", text: "Request a copy of the personal data we hold about you." },
      { bold: "Correction:", text: "Request correction of inaccurate or incomplete data." },
      { bold: "Deletion:", text: "Request deletion of your account and associated personal data (subject to legal retention requirements)." },
      { bold: "Opt-out:", text: "Opt out of promotional communications at any time by contacting us or using the unsubscribe link in emails." },
      { bold: "Grievance:", text: "Lodge a grievance with our Data Protection Officer (details below)." },
    ],
  },
  {
    id: "updates",
    title: "12. Changes to This Policy",
    content: [
      "We may update this Privacy Policy from time to time to reflect changes in our practices or applicable law. The updated version will be posted on this page with the revised date. We encourage you to review this policy periodically.",
    ],
  },
  {
    id: "contact",
    icon: Mail,
    title: "13. Contact & Grievance Officer",
    content: [
      "For privacy-related requests, complaints, or questions, please contact our Data Protection / Grievance Officer:",
    ],
    list: [
      { bold: "Email:", text: "support@gifteeng.com" },
      { bold: "WhatsApp:", text: "+91 80 700 11 777" },
      { bold: "Address:", text: "D-03, Plot 12, Akurli Godavari CHS, Mhada Road No. 2, Opp. MTNL, Lokhandwala, Kandivali East, Mumbai – 400101" },
      { bold: "Response time:", text: "We aim to respond to all privacy requests within 30 days." },
    ],
  },
];

const TOC = SECTIONS.map((s) => ({ id: s.id, title: s.title }));

export default function PrivacyPolicyPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-muted/40 py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary/10 mb-6">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-black mb-4 tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg">
            At Gifteeng, your privacy matters. Here is exactly what we collect and how we use it.
            Last updated: <span className="font-semibold text-foreground">April 2025</span>.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-5xl px-4 lg:grid lg:grid-cols-[240px,1fr] lg:gap-12">
          {/* Sticky TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Contents</p>
              {TOC.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block text-[12px] text-muted-foreground hover:text-primary transition-colors py-0.5 leading-snug"
                >
                  {item.title}
                </a>
              ))}
              <div className="pt-4 border-t border-border mt-4">
                <Link href="/b2c/terms" className="text-[12px] text-primary hover:underline block">Terms & Conditions →</Link>
                <Link href="/b2c/shipping" className="text-[12px] text-primary hover:underline block mt-1">Shipping Policy →</Link>
                <Link href="/b2c/returns" className="text-[12px] text-primary hover:underline block mt-1">Return Policy →</Link>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="space-y-12">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <div className="flex items-start gap-4">
                    {Icon ? (
                      <div className="hidden md:flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0 mt-1">
                        <Icon className="w-5 h-5" />
                      </div>
                    ) : null}
                    <div className="flex-1">
                      <h2 className="font-display text-xl md:text-2xl font-bold text-foreground mb-3">{section.title}</h2>
                      {section.content.map((p, pi) => (
                        <p key={pi} className="text-muted-foreground leading-relaxed mb-3">{p}</p>
                      ))}
                      {section.list && (
                        <ul className="space-y-2.5 mt-3">
                          {section.list.map((item, li) => (
                            <li key={li} className="flex items-start gap-2.5 text-muted-foreground">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />
                              <span>
                                {item.bold && <strong className="text-foreground">{item.bold} </strong>}
                                {item.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}

            <div className="p-6 rounded-2xl bg-muted border border-border text-center">
              <p className="text-sm text-muted-foreground">
                By using gifteeng.com, you acknowledge that you have read and agreed to this Privacy Policy.
                Questions? Email{" "}
                <a href="mailto:support@gifteeng.com" className="text-primary hover:underline">support@gifteeng.com</a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
