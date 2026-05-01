import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText, ShieldCheck, CreditCard, Truck, RotateCcw,
  Scale, Gavel, Coins, Sparkles, UserCheck, AlertTriangle,
  type LucideIcon,
} from "lucide-react";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Terms & Conditions – Gifteeng",
  description:
    "Read the full terms and conditions for using Gifteeng — including Goins loyalty, customisation, payment, delivery, and returns policy.",
};

type Section = {
  id: string;
  icon?: LucideIcon;
  title: string;
  content?: string[];
  list?: { bold?: string; text: string }[];
  subsections?: { title: string; content: string[]; list?: { bold?: string; text: string }[] }[];
};

const SECTIONS: Section[] = [
  {
    id: "introduction",
    icon: FileText,
    title: "1. Introduction",
    content: [
      "The domain www.gifteeng.com is operated by Imazyn Ecommerce Pvt Ltd, a company incorporated under the Companies Act 2013, with its registered office at D-03, Plot 12, Akurli Godavari CHS, Mhada Road No. 2, Opp. MTNL, Lokhandwala, Kandivali East, Mumbai – 400101 (hereinafter referred to as \"Gifteeng\", \"we\", \"our\", or \"the Company\").",
      "By accessing or using www.gifteeng.com, our mobile application, or any of our services, you agree to be bound by these Terms & Conditions and our Privacy Policy. If you do not agree to these terms, please do not use our platform.",
      "These terms may be updated from time to time. Continued use of the platform after changes constitutes acceptance of the revised terms. The date of the most recent revision appears at the bottom of this page.",
    ],
  },
  {
    id: "services",
    icon: Sparkles,
    title: "2. Our Services",
    content: [
      "Gifteeng is an online platform offering premium personalised gifts, lifestyle products, and corporate gifting solutions across India. Our services include:",
    ],
    list: [
      { bold: "E-Commerce Store:", text: "Browse and purchase ready-made or personalised gift products." },
      { bold: "Product Customisation:", text: "Upload photos, add text, and design custom products using our online canvas editor." },
      { bold: "Corporate Gifting:", text: "Bulk orders with custom branding for businesses, events, and HR programmes." },
      { bold: "Goins Loyalty Programme:", text: "Earn and redeem Gifteeng Goins through purchases, spin wheel, pick-me games, referrals, and reviews." },
      { bold: "Gift Quiz & AI Design:", text: "AI-powered gift recommendations and auto-generated designs." },
      { bold: "Gift Cards:", text: "Digital and physical gift cards redeemable on our platform." },
    ],
  },
  {
    id: "accounts",
    icon: UserCheck,
    title: "3. User Accounts",
    content: [
      "To make a purchase or access loyalty features, you must create an account using your mobile phone number. Authentication is done via a one-time password (OTP) sent via SMS.",
    ],
    list: [
      { text: "You must provide an accurate, current mobile number. You are responsible for all activity under your account." },
      { text: "One account per person. Creating multiple accounts to exploit promotions, Goins, or referral rewards is prohibited and will result in account suspension." },
      { text: "You must be at least 18 years old, or have parental/guardian consent, to create an account and make purchases." },
      { text: "We reserve the right to suspend or terminate any account that violates these terms or engages in fraudulent activity." },
    ],
  },
  {
    id: "goins",
    icon: Coins,
    title: "4. Gifteeng Goins — Loyalty Programme",
    content: [
      "Gifteeng Goins (\"Goins\") are a virtual loyalty currency issued by Imazyn Ecommerce Pvt Ltd. Goins are not cash, have no monetary value outside our platform, and cannot be transferred, sold, or exchanged for real currency.",
    ],
    subsections: [
      {
        title: "4.1 Earning Goins",
        content: ["You can earn Goins through:"],
        list: [
          { text: "Completing purchases (earning rate shown on product pages and at checkout)" },
          { text: "Daily Spin Wheel — once per calendar day; result is final" },
          { text: "Pick Me! game — once per day alongside spin" },
          { text: "Referring friends who make their first purchase" },
          { text: "Writing a verified product review" },
          { text: "Special promotional campaigns as announced from time to time" },
        ],
      },
      {
        title: "4.2 Redeeming Goins",
        content: ["1 Goin = ₹1 discount at checkout. Redemption is subject to:"],
        list: [
          { text: "Minimum order value (shown at checkout)" },
          { text: "Maximum redemption cap per order (shown at checkout)" },
          { text: "Goins cannot be used in combination with certain other discount codes unless explicitly stated" },
        ],
      },
      {
        title: "4.3 Modification & Termination of Goins",
        content: [
          "Gifteeng reserves the right, at its sole discretion and without prior notice, to:",
        ],
        list: [
          { text: "Change the earning rate, redemption value (currently 1G = ₹1), or any terms of the Goins programme" },
          { text: "Cap, reduce, or expire Goins balances" },
          { text: "Suspend or terminate the Goins programme entirely" },
          { text: "Void Goins earned through fraudulent means, exploits, or policy violations" },
          { text: "Deduct Goins if an order associated with those Goins is returned or cancelled" },
        ],
      },
      {
        title: "4.4 Expiry",
        content: [
          "Goins expire after 12 months of account inactivity. Any purchase or spin resets the inactivity clock. We will attempt to notify you before expiry, but are not obligated to do so.",
        ],
      },
    ],
  },
  {
    id: "customisation",
    icon: ShieldCheck,
    title: "5. Product Customisation",
    content: [
      "When you customise a product (upload photos, add text, choose designs), the following terms apply:",
    ],
    list: [
      { bold: "Your content:", text: "By uploading images or text, you confirm you have the legal right to use that content. You grant Gifteeng a non-exclusive licence to reproduce it solely for fulfilling your order. We will not use your design for any other purpose." },
      { bold: "Prohibited content:", text: "You may not upload content that is obscene, defamatory, infringes third-party IP rights, depicts minors inappropriately, or violates any applicable law. We reserve the right to reject or cancel any order containing such content." },
      { bold: "Colour variance:", text: "Colours shown on screen may differ slightly from printed output due to monitor calibration and print process characteristics. This does not constitute a defect." },
      { bold: "Size issues:", text: "For apparel and size-dependent products, once a custom product is dispatched, no refund or replacement is offered for incorrect size selection. Please verify using our size guide before ordering." },
      { bold: "Print accuracy:", text: "We print exactly what you submit. Typos, low-resolution images, or design errors in your submission are not eligible for returns." },
      { bold: "Approval:", text: "For large corporate orders, a digital proof will be shared for approval before production. No changes are accepted after approval is confirmed." },
    ],
  },
  {
    id: "product-accuracy",
    title: "6. Product Accuracy",
    content: [
      "Images on our website are for illustrative purposes only. The actual product colour, texture, and finish may vary slightly due to screen calibration, monitor settings, or natural variations in material.",
      "All dimensions and weights are approximate. While we strive for accuracy, minor variations are inherent in the manufacturing process.",
      "For mobile phone covers: some curved-display phones may result in the cover not fully encasing all functional key edges — this is noted on relevant product pages and is not a manufacturing defect.",
    ],
  },
  {
    id: "pricing",
    icon: CreditCard,
    title: "7. Pricing & GST",
    content: [
      "All prices displayed are inclusive of applicable Goods and Services Tax (GST) unless otherwise stated. We reserve the right to correct pricing errors; if an error is discovered after your order is placed, we will notify you before processing.",
      "Prices may change at any time without prior notice. Price changes do not affect orders already dispatched. Promotional prices are valid only for the stated period.",
    ],
  },
  {
    id: "payment",
    icon: CreditCard,
    title: "8. Payment",
    content: [
      "All payments on Gifteeng are processed securely through Razorpay Payments Private Limited, a PCI-DSS compliant payment gateway. We do not store your card details on our servers.",
    ],
    list: [
      { bold: "Accepted methods:", text: "Credit/Debit cards (Visa, Mastercard, RuPay), UPI (GPay, PhonePe, Paytm), Net Banking, EMI, and Wallets — subject to availability." },
      { bold: "Pre-authorisation:", text: "A pre-authorisation check may be performed before dispatch. Your card is charged only when the order is confirmed for fulfilment." },
      { bold: "Payment failure:", text: "If a payment fails mid-transaction and an amount is debited from your account, it will be automatically refunded by Razorpay within 5–7 business days. Contact us at support@gifteeng.com if the refund does not appear." },
      { bold: "GST invoice:", text: "A tax invoice will be issued for every order and available in your account under Order History." },
      { bold: "COD:", text: "Cash on Delivery may be offered on select pin codes and products. COD orders require confirmation via OTP at delivery." },
    ],
  },
  {
    id: "delivery",
    icon: Truck,
    title: "9. Delivery & Shipping",
    content: [
      "Estimated delivery timelines are displayed on the product page and at checkout. Standard delivery is 5–9 business days; custom/personalised products may take 7–14 business days.",
      "Delivery timelines are estimates and may be affected by courier delays, natural disasters, public holidays, or other unforeseen events. Gifteeng is not liable for delays caused by third-party logistics providers.",
    ],
    list: [
      { text: "We ship across India. Some remote pin codes may not be serviceable; you will be notified at checkout." },
      { text: "Free shipping thresholds apply as displayed on the website and may change without notice." },
      { text: "You will receive an SMS/WhatsApp notification with your tracking ID once your order is dispatched." },
      { text: "Ensure your delivery address and phone number are accurate. Gifteeng is not responsible for failed deliveries due to incorrect addresses." },
      { text: "For corporate orders, please ensure a responsible person is available at the delivery address to accept bulk shipments." },
    ],
  },
  {
    id: "returns",
    icon: RotateCcw,
    title: "10. Returns, Refunds & Cancellations",
    content: [
      "Please read our full Return Policy at gifteeng.com/returns. In summary:",
    ],
    list: [
      { bold: "Non-customised products:", text: "Eligible for return within 7 days of delivery if unused, in original packaging, with tags intact, and not a hygiene-restricted category." },
      { bold: "Personalised / custom products:", text: "NOT eligible for return or refund except in cases of manufacturing defect or wrong item delivered." },
      { bold: "Defective / wrong items:", text: "Must be reported within 48 hours of delivery with photo evidence. We will offer a replacement or full refund at our discretion." },
      { bold: "Size issues (apparel):", text: "Custom apparel is non-returnable for size reasons. Please verify against our size chart before ordering." },
      { bold: "Refund timeline:", text: "Approved refunds are credited to the original payment method within 5–7 business days." },
      { bold: "Cancellations:", text: "Orders may be cancelled before production begins. Once an item enters production (typically within 2–4 hours of confirmation), cancellation is not possible." },
      { bold: "Goins refund:", text: "If an order earning Goins is returned or refunded, the Goins associated with that order will be deducted from your balance." },
    ],
  },
  {
    id: "ip",
    icon: Scale,
    title: "11. Intellectual Property",
    content: [
      "All content on www.gifteeng.com — including text, graphics, logos, product designs, templates, software, and the \"Gifteeng\" brand — is the exclusive property of Imazyn Ecommerce Pvt Ltd and is protected under Indian copyright, trademark, and design laws.",
      "You may not copy, reproduce, distribute, or create derivative works from our content without explicit written permission. Unauthorised use will be prosecuted to the fullest extent of the law.",
    ],
  },
  {
    id: "prohibited",
    icon: AlertTriangle,
    title: "12. Prohibited Activities",
    content: [
      "The following activities are strictly prohibited on our platform:",
    ],
    list: [
      { text: "Creating fake accounts, multiple accounts, or using bots to exploit promotions, Goins, or referral rewards" },
      { text: "Placing fraudulent orders or providing false payment information" },
      { text: "Uploading infringing, obscene, or illegal content for customisation" },
      { text: "Attempting to reverse-engineer, scrape, or interfere with our platform" },
      { text: "Using our platform for any activity that violates Indian law" },
      { text: "Harassing, threatening, or abusing our customer support team" },
    ],
  },
  {
    id: "liability",
    title: "13. Limitation of Liability",
    content: [
      "To the maximum extent permitted by law, Imazyn Ecommerce Pvt Ltd shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of our platform, including loss of profits, data, or goodwill.",
      "Our total liability for any claim arising from a purchase shall not exceed the amount you paid for that specific order.",
      "We do not warrant that our website will be uninterrupted, error-free, or completely secure. You use the platform at your own risk.",
    ],
  },
  {
    id: "privacy",
    icon: ShieldCheck,
    title: "14. Privacy",
    content: [
      "Our collection and use of your personal data is governed by our Privacy Policy, available at gifteeng.com/privacy. By using our platform, you consent to the practices described therein.",
    ],
  },
  {
    id: "third-party",
    title: "15. Third-Party Services",
    content: [
      "Our platform integrates with third-party services including Razorpay (payments), shipper APIs (logistics), WhatsApp Business API (notifications), and analytics tools. We are not responsible for the privacy practices or terms of these third-party services. Their use is subject to their respective terms and policies.",
    ],
  },
  {
    id: "jurisdiction",
    icon: Gavel,
    title: "16. Governing Law & Jurisdiction",
    content: [
      "These Terms & Conditions are governed by and construed in accordance with the laws of India. Any disputes arising from or related to these terms or your use of our platform shall be subject to the exclusive jurisdiction of the courts at Mumbai, Maharashtra.",
    ],
  },
  {
    id: "indemnification",
    title: "17. Indemnification",
    content: [
      "You agree to indemnify, defend, and hold harmless Imazyn Ecommerce Pvt Ltd, its directors, officers, employees, consultants, agents, and affiliates from and against any third-party claims, liability, damages, costs, or expenses (including reasonable legal fees) arising from your use of our platform, your breach of these terms, or your violation of any third-party rights.",
    ],
  },
  {
    id: "termination",
    title: "18. Termination",
    content: [
      "We may suspend or terminate your access to our platform at any time, with or without notice, if we determine you have violated these terms, engaged in fraudulent activity, or for any other reason at our sole discretion. Upon termination, any Goins balance in your account is forfeited.",
    ],
  },
  {
    id: "contact",
    title: "19. Contact Us",
    content: [
      "For questions, complaints, or requests related to these Terms & Conditions, please contact us:",
    ],
    list: [
      { bold: "Email:", text: "support@gifteeng.com" },
      { bold: "WhatsApp:", text: "+91 80 700 11 777" },
      { bold: "Address:", text: "D-03, Plot 12, Akurli Godavari CHS, Mhada Road No. 2, Opp. MTNL, Lokhandwala, Kandivali East, Mumbai – 400101" },
    ],
  },
];

const TOC = SECTIONS.map((s) => ({ id: s.id, title: s.title }));

export default function TermsPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-muted/40 py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary/10 mb-6">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-black mb-4 tracking-tight">
            Terms &amp; Conditions
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-base md:text-lg">
            Please read these terms carefully before using our website and services.
            Last updated: <span className="font-semibold text-foreground">April 2025</span>.
          </p>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="mx-auto max-w-5xl px-4 lg:grid lg:grid-cols-[240px,1fr] lg:gap-12">
          {/* Sticky TOC — desktop only */}
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
                <Link href="/b2c/privacy" className="text-[12px] text-primary hover:underline block">Privacy Policy →</Link>
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
                      <h2 className="font-display text-xl md:text-2xl font-bold text-foreground mb-3">
                        {section.title}
                      </h2>
                      {section.content?.map((p, pi) => (
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
                      {section.subsections?.map((sub) => (
                        <div key={sub.title} className="mt-6 pl-4 border-l-2 border-primary/20">
                          <h3 className="font-semibold text-base text-foreground mb-2">{sub.title}</h3>
                          {sub.content.map((p, pi) => (
                            <p key={pi} className="text-muted-foreground leading-relaxed mb-2 text-sm">{p}</p>
                          ))}
                          {sub.list && (
                            <ul className="space-y-2 mt-2">
                              {sub.list.map((item, li) => (
                                <li key={li} className="flex items-start gap-2 text-sm text-muted-foreground">
                                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-2" />
                                  <span>
                                    {item.bold && <strong className="text-foreground">{item.bold} </strong>}
                                    {item.text}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}

            {/* Bottom note */}
            <div className="p-6 rounded-2xl bg-muted border border-border text-center">
              <p className="text-sm text-muted-foreground">
                By using gifteeng.com, you acknowledge that you have read, understood, and agreed to these Terms &amp; Conditions.
                Questions? Email{" "}
                <a href="mailto:support@gifteeng.com" className="text-primary hover:underline">
                  support@gifteeng.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
