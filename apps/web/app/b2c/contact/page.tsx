import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Phone, Clock } from "lucide-react";
import { ContactForm } from "./ContactForm";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Contact Gifteeng — Get in Touch",
  description:
    "Have questions about your order or custom gifts? Contact Gifteeng via email, WhatsApp, or our contact form. We're here to help!",
};

export default function ContactPage() {
  return (
    <div className="relative">
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h1 className="font-display text-3xl md:text-5xl font-black mb-4 tracking-tight">Get in Touch</h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
            Questions about an order or custom gift? We&apos;d love to hear from you.
          </p>
        </div>
      </section>

      <section className="pb-20">
        <div className="mx-auto max-w-5xl px-4">
          <div className="grid md:grid-cols-5 gap-8 md:gap-12">
            <div className="md:col-span-3">
              <ContactForm />
            </div>

            <div className="md:col-span-2 space-y-6">
              <div className="bg-card rounded-2xl p-7 shadow-sm">
                <h3 className="font-display font-bold text-base mb-6 tracking-tight flex items-center gap-2">
                  <div className="w-1.5 h-5 rounded-full bg-primary" />
                  Contact Details
                </h3>
                <div className="space-y-5">
                  <a
                    href="https://wa.me/918070011777"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                        WhatsApp Only
                      </p>
                      <span className="font-body text-sm font-medium group-hover:text-primary transition-colors">
                        +91 80 700 11 777
                      </span>
                    </div>
                  </a>
                  <a href="mailto:support@gifteeng.com" className="flex items-start gap-3 group">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Email</p>
                      <span className="font-body text-sm font-medium group-hover:text-primary transition-colors">
                        support@gifteeng.com
                      </span>
                    </div>
                  </a>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted text-foreground flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Office</p>
                      <span className="font-body text-sm font-medium">Kandivali, Mumbai, India</span>
                    </div>
                  </div>
                </div>
              </div>

              <a
                href="https://wa.me/918070011777?text=Hi! I need help with my order."
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 rounded-2xl p-5 bg-card hover:bg-muted transition-all"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#25D366] flex items-center justify-center flex-shrink-0 shadow-sm">
                  <MessageCircle className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-sm text-foreground">Chat on WhatsApp</p>
                  <p className="text-muted-foreground text-[11px] mt-0.5">Fastest way to reach us</p>
                </div>
              </a>

              <div className="bg-card rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-primary" />
                  <h4 className="font-display font-bold text-sm">Business Hours</h4>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Mon – Sat</span>
                    <span className="font-medium text-foreground">10:00 AM – 7:00 PM</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sunday</span>
                    <span className="font-medium text-destructive">Closed</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
