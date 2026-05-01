"use client";

import { useState, useEffect, useRef } from "react";
import {
  Settings, Save, Banknote, Bell, MessageSquare, Mail, CreditCard, Eye, EyeOff,
  Sparkles, Image, Upload, Loader2, Trash2, Gift,
  Store, Truck, Coins, Zap, Shield, Users, FileText, Building2, Link,
} from "lucide-react";
import { Input, Label, Button, Switch, Textarea, Tabs, TabsContent, TabsList, TabsTrigger,
  useToast,
} from "@gifteeng/ui";
import AdminPermissionsTab from "../_components/admin/AdminPermissionsTab";
import AdminUsersTab from "../_components/admin/AdminUsersTab";
import { authHeaders, getApiBase, safeGet, safePatch, safePost } from "@/lib/admin-api";

function useAuth() {
  return { isSuperAdmin: true };
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-[10px] text-muted-foreground mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ icon: Icon, label, desc, checked, onChange }: { icon?: any; label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        <div>
          <span className="text-xs font-medium">{label}</span>
          {desc && <p className="text-[10px] text-muted-foreground">{desc}</p>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} value={value} onChange={(e: any) => onChange(e.target.value)} className="h-8 text-xs pr-8" placeholder={placeholder || "••••••••"} />
      <button onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
        {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
    </div>
  );
}

function Section({ title, icon: Icon, children, toggle, onToggle }: { title: string; icon: any; children: React.ReactNode; toggle?: boolean; onToggle?: (v: boolean) => void }) {
  return (
    <div className="bg-card rounded-xl border border-border/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" /> {title}
        </h3>
        {onToggle !== undefined && <Switch checked={!!toggle} onCheckedChange={onToggle} />}
      </div>
      {children}
    </div>
  );
}

export default function AdminSettings() {
  const { isSuperAdmin } = useAuth();
  const [codEnabled, setCodEnabled] = useState(true);
  const [codCharge, setCodCharge] = useState("50");
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState("499");
  const [deliveryCharge, setDeliveryCharge] = useState("49");
  const [adminWhatsapp, setAdminWhatsapp] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [storeName, setStoreName] = useState("Gifteeng");
  const [razorpayEnabled, setRazorpayEnabled] = useState(false);
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  // ── Legal / Policy links ─────────────────────────────────────────────────
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState("https://gifteeng.com/privacy-policy");
  const [termsUrl, setTermsUrl]                 = useState("https://gifteeng.com/terms-and-conditions");
  const [shippingPolicyUrl, setShippingPolicyUrl] = useState("https://gifteeng.com/shipping-policy");
  const [returnPolicyUrl, setReturnPolicyUrl]   = useState("https://gifteeng.com/return-policy");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [heroEnabled, setHeroEnabled] = useState(true);
  const [heroTagline, setHeroTagline] = useState("ENGINEER YOUR EMOTIONS");
  const [heroHeading, setHeroHeading] = useState("Turn Memories Into");
  const [heroHeadingHighlight, setHeroHeadingHighlight] = useState("Beautiful Gifts");
  const [heroSubtitle, setHeroSubtitle] = useState("Custom photo frames, mugs, keychains & more — delivered to your door");
  const [heroBgImage, setHeroBgImage] = useState("");
  const [heroButtonText, setHeroButtonText] = useState("");
  const [heroButtonLink, setHeroButtonLink] = useState("");
  const [heroButton2Text, setHeroButton2Text] = useState("");
  const [heroButton2Link, setHeroButton2Link] = useState("");
  const [heroShowSearch, setHeroShowSearch] = useState(true);
  const [heroImageUploading, setHeroImageUploading] = useState(false);
  const heroFileRef = useRef<HTMLInputElement>(null);
  const [socialEnabled, setSocialEnabled] = useState(true);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [whatsappCommunityUrl, setWhatsappCommunityUrl] = useState("");
  const [whatsappCommunityText, setWhatsappCommunityText] = useState("Join our WhatsApp community for exclusive deals & updates!");
  const [shippingMode, setShippingMode] = useState("manual");
  const [shiprocketEmail, setShiprocketEmail] = useState("");
  const [shiprocketPassword, setShiprocketPassword] = useState("");
  const [coinsPerRupee, setCoinsPerRupee] = useState("10");
  const [goinsEnabled, setGoinsEnabled] = useState(true);
  const [surpriseGiftGoinsCost, setSurpriseGiftGoinsCost] = useState("50");
  const [spinWheelEnabled, setSpinWheelEnabled] = useState(true);
  const [spinWheelMaxGoins, setSpinWheelMaxGoins] = useState("100");
  const [giftWrapEnabled, setGiftWrapEnabled] = useState(true);
  const [giftWrapPrice, setGiftWrapPrice] = useState("49");
  const [deliveryDaysMumbai, setDeliveryDaysMumbai] = useState("3");
  const [deliveryDaysMaharashtra, setDeliveryDaysMaharashtra] = useState("4");
  const [deliveryDaysRest, setDeliveryDaysRest] = useState("5");
  const [exitPopupEnabled, setExitPopupEnabled] = useState(false);
  const [exitPopupTitle, setExitPopupTitle] = useState("Wait! Don't leave yet 🎁");
  const [exitPopupSubtitle, setExitPopupSubtitle] = useState("Here's a special discount just for you");
  const [exitPopupCode, setExitPopupCode] = useState("STAY10");
  const [exitPopupText, setExitPopupText] = useState("10% OFF your first order");
  const [exitPopupBtnText, setExitPopupBtnText] = useState("Continue Shopping");
  const [exitPopupDismissText, setExitPopupDismissText] = useState("No thanks, I'll pay full price");
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [flashTitle, setFlashTitle] = useState("Flash Sale!");
  const [flashSubtitle, setFlashSubtitle] = useState("Limited time offer");
  const [flashEndTime, setFlashEndTime] = useState("");
  const [flashDiscountText, setFlashDiscountText] = useState("Up to 40% OFF");
  const [flashLink, setFlashLink] = useState("/products");
  // ── Invoice & GST settings ────────────────────────────────────────────────
  const [invBusinessName, setInvBusinessName]   = useState("Gifteeng");
  const [invGstin, setInvGstin]                 = useState("");
  const [invPan, setInvPan]                     = useState("");
  const [invAddress, setInvAddress]             = useState("");
  const [invCity, setInvCity]                   = useState("");
  const [invState, setInvState]                 = useState("Maharashtra");
  const [invPincode, setInvPincode]             = useState("");
  const [invPhone, setInvPhone]                 = useState("");
  const [invEmail, setInvEmail]                 = useState("");
  const [invLogoUrl, setInvLogoUrl]             = useState("");
  const [invPrefix, setInvPrefix]               = useState("INV");
  const [invDueDays, setInvDueDays]             = useState("30");
  const [invDefaultNotes, setInvDefaultNotes]   = useState("Thank you for your business!");
  const [invTerms, setInvTerms]                 = useState("Payment due within 30 days of invoice date.");
  const [invBankName, setInvBankName]           = useState("");
  const [invBankAccount, setInvBankAccount]     = useState("");
  const [invBankIfsc, setInvBankIfsc]           = useState("");
  const [invBankBranch, setInvBankBranch]       = useState("");
  const [invBankUpi, setInvBankUpi]             = useState("");

  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      const data = await safeGet<Record<string, any>>('/admin/settings', {});
      Object.entries(data || {}).forEach(([key, raw]) => {
        const val = typeof raw === "string" ? raw : JSON.stringify(raw);
        const clean = val.replace(/^"|"$/g, "");
        switch (key) {
          case "cod_charge": setCodCharge(clean); break;
          case "free_delivery_above": setFreeDeliveryAbove(clean); break;
          case "delivery_charge": setDeliveryCharge(clean); break;
          case "cod_enabled": setCodEnabled(clean !== "false"); break;
          case "admin_whatsapp": setAdminWhatsapp(clean); break;
          case "admin_email": setAdminEmail(clean); break;
          case "whatsapp_enabled": setWhatsappEnabled(clean !== "false"); break;
          case "email_enabled": setEmailEnabled(clean !== "false"); break;
          case "store_name": setStoreName(clean || "Gifteeng"); break;
          case "razorpay_enabled": setRazorpayEnabled(clean === "true"); break;
          case "razorpay_key_id": setRazorpayKeyId(clean); break;
          case "razorpay_key_secret": setRazorpayKeySecret(clean); break;
          case "hero_enabled": setHeroEnabled(clean !== "false"); break;
          case "hero_tagline": if (clean) setHeroTagline(clean); break;
          case "hero_heading": if (clean) setHeroHeading(clean); break;
          case "hero_heading_highlight": if (clean) setHeroHeadingHighlight(clean); break;
          case "hero_subtitle": if (clean) setHeroSubtitle(clean); break;
          case "hero_bg_image": setHeroBgImage(clean); break;
          case "hero_button_text": setHeroButtonText(clean); break;
          case "hero_button_link": setHeroButtonLink(clean); break;
          case "hero_button2_text": setHeroButton2Text(clean); break;
          case "hero_button2_link": setHeroButton2Link(clean); break;
          case "hero_show_search": setHeroShowSearch(clean !== "false"); break;
          case "social_section_enabled": setSocialEnabled(clean !== "false"); break;
          case "instagram_url": setInstagramUrl(clean); break;
          case "instagram_handle": setInstagramHandle(clean); break;
          case "whatsapp_community_url": setWhatsappCommunityUrl(clean); break;
          case "whatsapp_community_text": if (clean) setWhatsappCommunityText(clean); break;
          case "shipping_mode": if (clean) setShippingMode(clean); break;
          case "shiprocket_email": setShiprocketEmail(clean); break;
          case "shiprocket_password": setShiprocketPassword(clean); break;
          case "coins_per_rupee": setCoinsPerRupee(clean || "10"); break;
          case "goins_enabled": setGoinsEnabled(clean !== "false"); break;
          case "surprise_gift_goins_cost": setSurpriseGiftGoinsCost(clean || "50"); break;
          case "spin_wheel_enabled": setSpinWheelEnabled(clean !== "false"); break;
          case "spin_wheel_max_goins": setSpinWheelMaxGoins(clean || "100"); break;
          case "exit_intent_popup": {
            try {
              const v = typeof raw === "string" ? JSON.parse(raw) : raw;
              if (v) {
                setExitPopupEnabled(!!v.enabled);
                if (v.title) setExitPopupTitle(v.title);
                if (v.subtitle) setExitPopupSubtitle(v.subtitle);
                if (v.discount_code) setExitPopupCode(v.discount_code);
                if (v.discount_text) setExitPopupText(v.discount_text);
                if (v.button_text) setExitPopupBtnText(v.button_text);
                if (v.dismiss_text) setExitPopupDismissText(v.dismiss_text);
              }
            } catch {} break;
          }
          case "flash_sale": {
            try {
              const v = typeof raw === "string" ? JSON.parse(raw) : raw;
              if (v) {
                setFlashEnabled(!!v.enabled);
                if (v.title) setFlashTitle(v.title);
                if (v.subtitle) setFlashSubtitle(v.subtitle);
                if (v.end_time) setFlashEndTime(v.end_time.slice(0, 16));
                if (v.discount_text) setFlashDiscountText(v.discount_text);
                if (v.link) setFlashLink(v.link);
              }
            } catch {} break;
          }
          case "gift_wrap_enabled": setGiftWrapEnabled(clean !== "false"); break;
          case "gift_wrap_price": setGiftWrapPrice(clean || "49"); break;
          case "delivery_days_mumbai": setDeliveryDaysMumbai(clean || "3"); break;
          case "delivery_days_maharashtra": setDeliveryDaysMaharashtra(clean || "4"); break;
          case "delivery_days_rest": setDeliveryDaysRest(clean || "5"); break;
          case "invoice_business_name": if (clean) setInvBusinessName(clean); break;
          case "invoice_gstin": setInvGstin(clean); break;
          case "invoice_pan": setInvPan(clean); break;
          case "invoice_address": setInvAddress(clean); break;
          case "invoice_city": setInvCity(clean); break;
          case "invoice_state": if (clean) setInvState(clean); break;
          case "invoice_pincode": setInvPincode(clean); break;
          case "invoice_phone": setInvPhone(clean); break;
          case "invoice_email": setInvEmail(clean); break;
          case "invoice_logo_url": setInvLogoUrl(clean); break;
          case "invoice_prefix": if (clean) setInvPrefix(clean); break;
          case "invoice_due_days": if (clean) setInvDueDays(clean); break;
          case "invoice_default_notes": if (clean) setInvDefaultNotes(clean); break;
          case "invoice_terms": if (clean) setInvTerms(clean); break;
          case "invoice_bank_name": setInvBankName(clean); break;
          case "invoice_bank_account": setInvBankAccount(clean); break;
          case "invoice_bank_ifsc": setInvBankIfsc(clean); break;
          case "invoice_bank_branch": setInvBankBranch(clean); break;
          case "invoice_bank_upi": setInvBankUpi(clean); break;
          case "legal_links": {
            try {
              const v = typeof raw === "string" ? JSON.parse(raw) : raw;
              if (v && typeof v === "object") {
                if (v.privacy_policy) setPrivacyPolicyUrl(v.privacy_policy);
                if (v.terms)          setTermsUrl(v.terms);
                if (v.shipping)       setShippingPolicyUrl(v.shipping);
                if (v.returns)        setReturnPolicyUrl(v.returns);
              }
            } catch {} break;
          }
        }
      });
      setLoading(false);
    };
    fetchData();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    const settings: { key: string; value: any }[] = [
      { key: "cod_enabled", value: codEnabled },
      { key: "cod_charge", value: Number(codCharge || 0) },
      { key: "free_delivery_above", value: Number(freeDeliveryAbove || 0) },
      { key: "delivery_charge", value: Number(deliveryCharge || 0) },
      { key: "admin_whatsapp", value: adminWhatsapp },
      { key: "admin_email", value: adminEmail },
      { key: "whatsapp_enabled", value: whatsappEnabled },
      { key: "email_enabled", value: emailEnabled },
      { key: "store_name", value: storeName },
      { key: "razorpay_enabled", value: razorpayEnabled },
      { key: "razorpay_key_id", value: razorpayKeyId },
      { key: "razorpay_key_secret", value: razorpayKeySecret },
      { key: "hero_enabled", value: heroEnabled },
      { key: "hero_tagline", value: heroTagline },
      { key: "hero_heading", value: heroHeading },
      { key: "hero_heading_highlight", value: heroHeadingHighlight },
      { key: "hero_subtitle", value: heroSubtitle },
      { key: "hero_bg_image", value: heroBgImage },
      { key: "hero_button_text", value: heroButtonText },
      { key: "hero_button_link", value: heroButtonLink },
      { key: "hero_button2_text", value: heroButton2Text },
      { key: "hero_button2_link", value: heroButton2Link },
      { key: "hero_show_search", value: heroShowSearch },
      { key: "social_section_enabled", value: socialEnabled },
      { key: "instagram_url", value: instagramUrl },
      { key: "instagram_handle", value: instagramHandle },
      { key: "whatsapp_community_url", value: whatsappCommunityUrl },
      { key: "whatsapp_community_text", value: whatsappCommunityText },
      { key: "shipping_mode", value: shippingMode },
      { key: "shiprocket_email", value: shiprocketEmail },
      { key: "shiprocket_password", value: shiprocketPassword },
      { key: "coins_per_rupee", value: Number(coinsPerRupee || 10) },
      { key: "goins_enabled", value: goinsEnabled },
      { key: "surprise_gift_goins_cost", value: Number(surpriseGiftGoinsCost || 50) },
      { key: "spin_wheel_enabled", value: spinWheelEnabled },
      { key: "spin_wheel_max_goins", value: Number(spinWheelMaxGoins || 100) },
      { key: "exit_intent_popup", value: { enabled: exitPopupEnabled, title: exitPopupTitle, subtitle: exitPopupSubtitle, discount_code: exitPopupCode, discount_text: exitPopupText, button_text: exitPopupBtnText, dismiss_text: exitPopupDismissText } },
      { key: "flash_sale", value: { enabled: flashEnabled, title: flashTitle, subtitle: flashSubtitle, end_time: flashEndTime ? new Date(flashEndTime).toISOString() : "", discount_text: flashDiscountText, link: flashLink } },
      { key: "gift_wrap_enabled", value: giftWrapEnabled },
      { key: "gift_wrap_price", value: Number(giftWrapPrice || 49) },
      { key: "delivery_days_mumbai", value: Number(deliveryDaysMumbai || 3) },
      { key: "delivery_days_maharashtra", value: Number(deliveryDaysMaharashtra || 4) },
      { key: "delivery_days_rest", value: Number(deliveryDaysRest || 5) },
      { key: "invoice_business_name", value: invBusinessName },
      { key: "invoice_gstin", value: invGstin },
      { key: "invoice_pan", value: invPan },
      { key: "invoice_address", value: invAddress },
      { key: "invoice_city", value: invCity },
      { key: "invoice_state", value: invState },
      { key: "invoice_pincode", value: invPincode },
      { key: "invoice_phone", value: invPhone },
      { key: "invoice_email", value: invEmail },
      { key: "invoice_logo_url", value: invLogoUrl },
      { key: "invoice_prefix", value: invPrefix },
      { key: "invoice_due_days", value: Number(invDueDays || 30) },
      { key: "invoice_default_notes", value: invDefaultNotes },
      { key: "invoice_terms", value: invTerms },
      { key: "invoice_bank_name", value: invBankName },
      { key: "invoice_bank_account", value: invBankAccount },
      { key: "invoice_bank_ifsc", value: invBankIfsc },
      { key: "invoice_bank_branch", value: invBankBranch },
      { key: "invoice_bank_upi", value: invBankUpi },
      { key: "legal_links", value: { privacy_policy: privacyPolicyUrl, terms: termsUrl, shipping: shippingPolicyUrl, returns: returnPolicyUrl } },
    ];
    for (const s of settings) {
      await safePatch(`/admin/settings/${s.key}`, { value: s.value }, null);
    }
    setSaving(false);
    toast({ title: "Settings saved!" });
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-xs text-muted-foreground">Loading settings…</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold tracking-tight">Settings</h2>
            <p className="text-[11px] text-muted-foreground">Site-wide configuration</p>
          </div>
        </div>
        <Button onClick={saveSettings} disabled={saving} size="sm" className="gap-1.5 h-9">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save All
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap gap-0.5 bg-muted/50 p-1">
          <TabsTrigger value="general" className="text-xs gap-1.5 data-[state=active]:bg-background"><Store className="w-3.5 h-3.5" /> General</TabsTrigger>
          <TabsTrigger value="payments" className="text-xs gap-1.5 data-[state=active]:bg-background"><Banknote className="w-3.5 h-3.5" /> Payments</TabsTrigger>
          <TabsTrigger value="hero" className="text-xs gap-1.5 data-[state=active]:bg-background"><Sparkles className="w-3.5 h-3.5" /> Hero</TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs gap-1.5 data-[state=active]:bg-background"><Bell className="w-3.5 h-3.5" /> Alerts</TabsTrigger>
          <TabsTrigger value="engagement" className="text-xs gap-1.5 data-[state=active]:bg-background"><Zap className="w-3.5 h-3.5" /> Engagement</TabsTrigger>
          <TabsTrigger value="invoice" className="text-xs gap-1.5 data-[state=active]:bg-background"><FileText className="w-3.5 h-3.5" /> Invoice &amp; GST</TabsTrigger>
          <TabsTrigger value="legal" className="text-xs gap-1.5 data-[state=active]:bg-background"><Link className="w-3.5 h-3.5" /> Legal Links</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="admins" className="text-xs gap-1.5 data-[state=active]:bg-background"><Users className="w-3.5 h-3.5" /> Admins</TabsTrigger>}
          {isSuperAdmin && <TabsTrigger value="permissions" className="text-xs gap-1.5 data-[state=active]:bg-background"><Shield className="w-3.5 h-3.5" /> Admin Access</TabsTrigger>}
        </TabsList>

        {/* GENERAL */}
        <TabsContent value="general" className="space-y-4">
          <Section title="Store Info" icon={Store}>
            <Field label="Store Name">
              <Input value={storeName} onChange={(e: any) => setStoreName(e.target.value)} className="h-9 text-sm max-w-sm" placeholder="Gifteeng" />
            </Field>
          </Section>

          <Section title="Shipping" icon={Truck}>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-muted-foreground">
                {shippingMode === "shiprocket" ? "Auto via Shiprocket" : "Manual tracking URLs"}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] ${shippingMode === "manual" ? "font-semibold" : "text-muted-foreground"}`}>Manual</span>
                <Switch checked={shippingMode === "shiprocket"} onCheckedChange={(v: boolean) => setShippingMode(v ? "shiprocket" : "manual")} />
                <span className={`text-[11px] ${shippingMode === "shiprocket" ? "font-semibold" : "text-muted-foreground"}`}>Shiprocket</span>
              </div>
            </div>
            {shippingMode === "shiprocket" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <Field label="Shiprocket Email">
                  <Input type="email" value={shiprocketEmail} onChange={(e: any) => setShiprocketEmail(e.target.value)} className="h-8 text-xs" placeholder="your@email.com" />
                </Field>
                <Field label="Password">
                  <SecretInput value={shiprocketPassword} onChange={setShiprocketPassword} />
                </Field>
              </div>
            )}
            <div className="pt-3 border-t border-border/30">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Estimated Delivery Days</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Mumbai/Thane">
                  <Input type="number" min="1" value={deliveryDaysMumbai} onChange={(e: any) => setDeliveryDaysMumbai(e.target.value)} className="h-8 text-xs" />
                </Field>
                <Field label="Maharashtra">
                  <Input type="number" min="1" value={deliveryDaysMaharashtra} onChange={(e: any) => setDeliveryDaysMaharashtra(e.target.value)} className="h-8 text-xs" />
                </Field>
                <Field label="Rest of India">
                  <Input type="number" min="1" value={deliveryDaysRest} onChange={(e: any) => setDeliveryDaysRest(e.target.value)} className="h-8 text-xs" />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Gift Wrap" icon={Gift} toggle={giftWrapEnabled} onToggle={setGiftWrapEnabled}>
            {giftWrapEnabled && (
              <Field label="Gift Wrap Price (₹)" className="max-w-[160px]">
                <Input type="number" value={giftWrapPrice} onChange={(e: any) => setGiftWrapPrice(e.target.value)} className="h-8 text-xs" placeholder="49" />
              </Field>
            )}
          </Section>

          <Section title="Social & Community" icon={MessageSquare} toggle={socialEnabled} onToggle={setSocialEnabled}>
            {socialEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Instagram URL">
                  <Input value={instagramUrl} onChange={(e: any) => setInstagramUrl(e.target.value)} className="h-8 text-xs" placeholder="https://instagram.com/..." />
                </Field>
                <Field label="Instagram Handle">
                  <Input value={instagramHandle} onChange={(e: any) => setInstagramHandle(e.target.value)} className="h-8 text-xs" placeholder="@yourstore" />
                </Field>
                <Field label="WhatsApp Community Link">
                  <Input value={whatsappCommunityUrl} onChange={(e: any) => setWhatsappCommunityUrl(e.target.value)} className="h-8 text-xs" placeholder="https://chat.whatsapp.com/..." />
                </Field>
                <Field label="WhatsApp CTA Text">
                  <Input value={whatsappCommunityText} onChange={(e: any) => setWhatsappCommunityText(e.target.value)} className="h-8 text-xs" placeholder="Join our community..." />
                </Field>
              </div>
            )}
          </Section>
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payments" className="space-y-4">
          <Section title="Razorpay Gateway" icon={CreditCard} toggle={razorpayEnabled} onToggle={setRazorpayEnabled}>
            {razorpayEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Key ID">
                  <Input value={razorpayKeyId} onChange={(e: any) => setRazorpayKeyId(e.target.value)} className="h-8 text-xs font-mono" placeholder="rzp_live_xxx" />
                </Field>
                <Field label="Key Secret">
                  <SecretInput value={razorpayKeySecret} onChange={setRazorpayKeySecret} placeholder="••••••••" />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Cash on Delivery" icon={Banknote} toggle={codEnabled} onToggle={setCodEnabled}>
            <div className="grid grid-cols-3 gap-3">
              <Field label="COD Charge ₹" className={!codEnabled ? "opacity-40 pointer-events-none" : ""}>
                <Input type="number" value={codCharge} onChange={(e: any) => setCodCharge(e.target.value)} className="h-8 text-xs" placeholder="50" />
              </Field>
              <Field label="Delivery Charge ₹">
                <Input type="number" value={deliveryCharge} onChange={(e: any) => setDeliveryCharge(e.target.value)} className="h-8 text-xs" placeholder="49" />
              </Field>
              <Field label="Free Above ₹">
                <Input type="number" value={freeDeliveryAbove} onChange={(e: any) => setFreeDeliveryAbove(e.target.value)} className="h-8 text-xs" placeholder="499" />
              </Field>
            </div>
          </Section>

          <Section title="Loyalty / Goins" icon={Coins} toggle={goinsEnabled} onToggle={setGoinsEnabled}>
            {goinsEnabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Goins per ₹100 spent">
                    <Input type="number" value={coinsPerRupee} onChange={(e: any) => setCoinsPerRupee(e.target.value)} className="h-8 text-xs" placeholder="10" />
                  </Field>
                  <Field label="🎁 Surprise Gift Unlock Cost">
                    <Input type="number" value={surpriseGiftGoinsCost} onChange={(e: any) => setSurpriseGiftGoinsCost(e.target.value)} className="h-8 text-xs" placeholder="50" />
                  </Field>
                </div>
                <div className="border-t border-border/30 pt-3">
                  <ToggleRow label="🎡 Spin the Wheel" desc="Let users spin for Goins" checked={spinWheelEnabled} onChange={setSpinWheelEnabled} />
                  {spinWheelEnabled && (
                    <Field label="Max Goins per spin" className="max-w-[160px] mt-2">
                      <Input type="number" value={spinWheelMaxGoins} onChange={(e: any) => setSpinWheelMaxGoins(e.target.value)} className="h-8 text-xs" placeholder="100" />
                    </Field>
                  )}
                </div>
              </div>
            )}
          </Section>
        </TabsContent>

        {/* HERO */}
        <TabsContent value="hero" className="space-y-4">
          <Section title="Hero Section" icon={Sparkles} toggle={heroEnabled} onToggle={setHeroEnabled}>
            {heroEnabled && (
              <div className="space-y-3">
                <Field label="Tagline">
                  <Input value={heroTagline} onChange={(e: any) => setHeroTagline(e.target.value)} className="h-8 text-xs" placeholder="ENGINEER YOUR EMOTIONS" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Heading">
                    <Input value={heroHeading} onChange={(e: any) => setHeroHeading(e.target.value)} className="h-8 text-xs" placeholder="Turn Memories Into" />
                  </Field>
                  <Field label="Highlight (gradient)">
                    <Input value={heroHeadingHighlight} onChange={(e: any) => setHeroHeadingHighlight(e.target.value)} className="h-8 text-xs" placeholder="Beautiful Gifts" />
                  </Field>
                </div>
                <Field label="Subtitle">
                  <Textarea value={heroSubtitle} onChange={(e: any) => setHeroSubtitle(e.target.value)} className="text-xs min-h-[50px] resize-y" rows={2} placeholder="Custom photo frames, mugs..." />
                </Field>

                <Field label="Background Image">
                  <div className="flex gap-1.5">
                    <Input value={heroBgImage} onChange={(e: any) => setHeroBgImage(e.target.value)} className="h-8 text-xs flex-1" placeholder="Paste URL or upload" />
                    <input ref={heroFileRef} type="file" accept="image/*" className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setHeroImageUploading(true);
                        try {
                          const fd = new FormData();
                          fd.append("file", file);
                          fd.append("bucket", "hero-images");
                          const res = await fetch(`${getApiBase()}/api/files/upload`, { method: "POST", headers: authHeaders(), body: fd });
                          if (res.ok) {
                            const data = await res.json();
                            setHeroBgImage(data.url || "");
                            toast({ title: "Uploaded!" });
                          } else {
                            toast({ title: "Upload failed", variant: "destructive" });
                          }
                        } catch (err: any) {
                          toast({ title: "Upload failed", description: err?.message, variant: "destructive" });
                        }
                        setHeroImageUploading(false);
                        if (heroFileRef.current) heroFileRef.current.value = "";
                      }}
                    />
                    <Button variant="outline" size="sm" disabled={heroImageUploading} onClick={() => heroFileRef.current?.click()} className="h-8 w-8 p-0 shrink-0">
                      {heroImageUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    </Button>
                    {heroBgImage && (
                      <Button variant="ghost" size="sm" onClick={() => setHeroBgImage("")} className="h-8 w-8 p-0 shrink-0 text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  {heroBgImage && <img src={heroBgImage} alt="preview" className="mt-2 rounded-lg h-20 object-cover w-full border border-border/30" />}
                </Field>

                <div className="pt-3 border-t border-border/30">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Buttons</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Button 1 Text">
                      <Input value={heroButtonText} onChange={(e: any) => setHeroButtonText(e.target.value)} className="h-8 text-xs" placeholder="Shop Now" />
                    </Field>
                    <Field label="Button 1 Link">
                      <Input value={heroButtonLink} onChange={(e: any) => setHeroButtonLink(e.target.value)} className="h-8 text-xs font-mono" placeholder="/products" />
                    </Field>
                    <Field label="Button 2 Text">
                      <Input value={heroButton2Text} onChange={(e: any) => setHeroButton2Text(e.target.value)} className="h-8 text-xs" placeholder="Corporate Orders" />
                    </Field>
                    <Field label="Button 2 Link">
                      <Input value={heroButton2Link} onChange={(e: any) => setHeroButton2Link(e.target.value)} className="h-8 text-xs font-mono" placeholder="/corporate" />
                    </Field>
                  </div>
                </div>

                <ToggleRow icon={Image} label="Show search bar in hero" checked={heroShowSearch} onChange={setHeroShowSearch} />
              </div>
            )}
          </Section>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications" className="space-y-4">
          <Section title="Order Notifications" icon={Bell}>
            <ToggleRow icon={MessageSquare} label="WhatsApp Alerts" desc="Send order updates via WhatsApp" checked={whatsappEnabled} onChange={setWhatsappEnabled} />
            {whatsappEnabled && (
              <Field label="Admin WhatsApp Number" className="ml-6 max-w-xs">
                <Input value={adminWhatsapp} onChange={(e: any) => setAdminWhatsapp(e.target.value)} className="h-8 text-xs" placeholder="919876543210" />
              </Field>
            )}

            <div className="border-t border-border/30" />

            <ToggleRow icon={Mail} label="Email Alerts" desc="Send order confirmations via email" checked={emailEnabled} onChange={setEmailEnabled} />
            {emailEnabled && (
              <Field label="Admin Email" className="ml-6 max-w-xs">
                <Input type="email" value={adminEmail} onChange={(e: any) => setAdminEmail(e.target.value)} className="h-8 text-xs" placeholder="admin@store.com" />
              </Field>
            )}
          </Section>
        </TabsContent>

        {/* ENGAGEMENT */}
        <TabsContent value="engagement" className="space-y-4">
          <Section title="Exit-Intent Popup" icon={Zap} toggle={exitPopupEnabled} onToggle={setExitPopupEnabled}>
            {exitPopupEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Title">
                  <Input value={exitPopupTitle} onChange={(e: any) => setExitPopupTitle(e.target.value)} className="h-8 text-xs" />
                </Field>
                <Field label="Subtitle">
                  <Input value={exitPopupSubtitle} onChange={(e: any) => setExitPopupSubtitle(e.target.value)} className="h-8 text-xs" />
                </Field>
                <Field label="Discount Code">
                  <Input value={exitPopupCode} onChange={(e: any) => setExitPopupCode(e.target.value)} className="h-8 text-xs font-mono" />
                </Field>
                <Field label="Discount Text">
                  <Input value={exitPopupText} onChange={(e: any) => setExitPopupText(e.target.value)} className="h-8 text-xs" placeholder="10% OFF your first order" />
                </Field>
                <Field label="Button Text">
                  <Input value={exitPopupBtnText} onChange={(e: any) => setExitPopupBtnText(e.target.value)} className="h-8 text-xs" />
                </Field>
                <Field label="Dismiss Text">
                  <Input value={exitPopupDismissText} onChange={(e: any) => setExitPopupDismissText(e.target.value)} className="h-8 text-xs" />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Flash Sale Countdown" icon={Sparkles} toggle={flashEnabled} onToggle={setFlashEnabled}>
            {flashEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Title">
                  <Input value={flashTitle} onChange={(e: any) => setFlashTitle(e.target.value)} className="h-8 text-xs" />
                </Field>
                <Field label="Subtitle">
                  <Input value={flashSubtitle} onChange={(e: any) => setFlashSubtitle(e.target.value)} className="h-8 text-xs" />
                </Field>
                <Field label="End Date & Time">
                  <Input type="datetime-local" value={flashEndTime} onChange={(e: any) => setFlashEndTime(e.target.value)} className="h-8 text-xs" />
                </Field>
                <Field label="Discount Label">
                  <Input value={flashDiscountText} onChange={(e: any) => setFlashDiscountText(e.target.value)} className="h-8 text-xs" placeholder="Up to 40% OFF" />
                </Field>
                <Field label="Link" className="sm:col-span-2">
                  <Input value={flashLink} onChange={(e: any) => setFlashLink(e.target.value)} className="h-8 text-xs font-mono" placeholder="/products" />
                </Field>
              </div>
            )}
          </Section>
        </TabsContent>

        {/* INVOICE & GST */}
        <TabsContent value="invoice" className="space-y-4">

          <Section title="Business / Supplier Details" icon={Building2}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Business Name">
                <Input value={invBusinessName} onChange={(e: any) => setInvBusinessName(e.target.value)} className="h-8 text-xs" placeholder="Gifteeng" />
              </Field>
              <Field label="GSTIN">
                <Input value={invGstin} onChange={(e: any) => setInvGstin(e.target.value.toUpperCase())} className="h-8 text-xs font-mono" placeholder="27AAACG1234F1ZX" maxLength={15} />
              </Field>
              <Field label="PAN Number">
                <Input value={invPan} onChange={(e: any) => setInvPan(e.target.value.toUpperCase())} className="h-8 text-xs font-mono" placeholder="AABCG1234D" maxLength={10} />
              </Field>
              <Field label="Registered State">
                <Input value={invState} onChange={(e: any) => setInvState(e.target.value)} className="h-8 text-xs" placeholder="Maharashtra" />
              </Field>
              <Field label="Address">
                <Input value={invAddress} onChange={(e: any) => setInvAddress(e.target.value)} className="h-8 text-xs" placeholder="123 Business Park, Baner" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="City">
                  <Input value={invCity} onChange={(e: any) => setInvCity(e.target.value)} className="h-8 text-xs" placeholder="Pune" />
                </Field>
                <Field label="Pincode">
                  <Input value={invPincode} onChange={(e: any) => setInvPincode(e.target.value)} className="h-8 text-xs" placeholder="411045" maxLength={6} />
                </Field>
              </div>
              <Field label="Billing Phone">
                <Input value={invPhone} onChange={(e: any) => setInvPhone(e.target.value)} className="h-8 text-xs" placeholder="+91 98765 43210" />
              </Field>
              <Field label="Billing Email">
                <Input type="email" value={invEmail} onChange={(e: any) => setInvEmail(e.target.value)} className="h-8 text-xs" placeholder="billing@gifteeng.com" />
              </Field>
            </div>
          </Section>

          <Section title="Invoice Defaults" icon={FileText}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Invoice Prefix">
                <Input value={invPrefix} onChange={(e: any) => setInvPrefix(e.target.value)} className="h-8 text-xs font-mono" placeholder="INV" />
              </Field>
              <Field label="Default Due Days">
                <Input type="number" min="1" value={invDueDays} onChange={(e: any) => setInvDueDays(e.target.value)} className="h-8 text-xs" placeholder="30" />
              </Field>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Invoice numbers will be generated as: <span className="font-mono text-primary">{invPrefix}/{new Date().getFullYear()}-{String(new Date().getFullYear()+1).slice(2)}/0001</span>
            </p>
            <Field label="Default Notes (appears on all invoices)">
              <Textarea value={invDefaultNotes} onChange={(e: any) => setInvDefaultNotes(e.target.value)} className="text-xs min-h-[60px] resize-y" rows={2} placeholder="Thank you for your business!" />
            </Field>
            <Field label="Terms & Conditions">
              <Textarea value={invTerms} onChange={(e: any) => setInvTerms(e.target.value)} className="text-xs min-h-[80px] resize-y" rows={3} placeholder="Payment due within 30 days..." />
            </Field>
          </Section>

          <Section title="Bank Details (shown on invoice)" icon={Banknote}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Bank Name">
                <Input value={invBankName} onChange={(e: any) => setInvBankName(e.target.value)} className="h-8 text-xs" placeholder="HDFC Bank" />
              </Field>
              <Field label="Account Number">
                <Input value={invBankAccount} onChange={(e: any) => setInvBankAccount(e.target.value)} className="h-8 text-xs font-mono" placeholder="XXXXXXXXXX" />
              </Field>
              <Field label="IFSC Code">
                <Input value={invBankIfsc} onChange={(e: any) => setInvBankIfsc(e.target.value.toUpperCase())} className="h-8 text-xs font-mono" placeholder="HDFC0001234" maxLength={11} />
              </Field>
              <Field label="Branch">
                <Input value={invBankBranch} onChange={(e: any) => setInvBankBranch(e.target.value)} className="h-8 text-xs" placeholder="Baner, Pune" />
              </Field>
              <Field label="UPI ID (optional)">
                <Input value={invBankUpi} onChange={(e: any) => setInvBankUpi(e.target.value)} className="h-8 text-xs font-mono" placeholder="gifteeng@hdfcbank" />
              </Field>
            </div>
            {!invBankName && (
              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ Bank details not set — they won't appear on invoices until filled in.
              </p>
            )}
          </Section>

        </TabsContent>

        {/* LEGAL LINKS */}
        <TabsContent value="legal" className="space-y-4">
          <Section title="Legal & Policy Links" icon={Link}>
            <p className="text-[11px] text-muted-foreground -mt-1 mb-1">
              These URLs are shown in the mobile app's Help &amp; Support screen. Update them whenever you publish new policy pages.
            </p>
            <div className="space-y-3">
              <Field label="🔒 Privacy Policy URL">
                <Input value={privacyPolicyUrl} onChange={(e: any) => setPrivacyPolicyUrl(e.target.value)} className="h-8 text-xs font-mono" placeholder="https://gifteeng.com/privacy-policy" />
              </Field>
              <Field label="📜 Terms & Conditions URL">
                <Input value={termsUrl} onChange={(e: any) => setTermsUrl(e.target.value)} className="h-8 text-xs font-mono" placeholder="https://gifteeng.com/terms-and-conditions" />
              </Field>
              <Field label="🚚 Shipping Policy URL">
                <Input value={shippingPolicyUrl} onChange={(e: any) => setShippingPolicyUrl(e.target.value)} className="h-8 text-xs font-mono" placeholder="https://gifteeng.com/shipping-policy" />
              </Field>
              <Field label="↩️ Return & Refund Policy URL">
                <Input value={returnPolicyUrl} onChange={(e: any) => setReturnPolicyUrl(e.target.value)} className="h-8 text-xs font-mono" placeholder="https://gifteeng.com/return-policy" />
              </Field>
            </div>
            <div className="mt-2 rounded-lg bg-muted/50 border border-border/40 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">
                <span className="font-semibold text-foreground">API key:</span> <code className="font-mono text-primary">legal_links</code> · served via <code className="font-mono text-primary">GET /settings/public</code> — no auth required.
              </p>
            </div>
          </Section>
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="admins" className="space-y-4">
            <AdminUsersTab />
          </TabsContent>
        )}

        {isSuperAdmin && (
          <TabsContent value="permissions" className="space-y-4">
            <AdminPermissionsTab />
          </TabsContent>
        )}

      </Tabs>

      {/* Sticky bottom save */}
      <div className="sticky bottom-0 pt-3 pb-2 bg-gradient-to-t from-background via-background to-transparent -mx-1 px-1">
        <Button onClick={saveSettings} disabled={saving} className="w-full h-10 gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save All Settings
        </Button>
      </div>
    </div>
  );
}
