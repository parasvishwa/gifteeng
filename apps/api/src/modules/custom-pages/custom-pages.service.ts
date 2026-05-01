import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type CustomPageCreateInput = {
  title: string;
  slug: string;
  html_content?: string;
  is_published?: boolean;
};

export type CustomPageUpdateInput = Partial<CustomPageCreateInput> & {
  updated_at?: string;
};

@Injectable()
export class CustomPagesService {
  constructor(private prisma: PrismaService) {}

  findAll(search?: string) {
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      return this.prisma.customPage.findMany({
        where: {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
    }
    return this.prisma.customPage.findMany({ orderBy: { createdAt: "desc" } });
  }

  async findOne(id: string) {
    const page = await this.prisma.customPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException();
    return page;
  }

  create(input: CustomPageCreateInput) {
    return this.prisma.customPage.create({
      data: {
        title: input.title,
        slug: input.slug,
        htmlContent: input.html_content ?? "",
        isPublished: input.is_published ?? false,
      },
    });
  }

  async update(id: string, input: CustomPageUpdateInput) {
    const existing = await this.prisma.customPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    return this.prisma.customPage.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.html_content !== undefined && { htmlContent: input.html_content }),
        ...(input.is_published !== undefined && { isPublished: input.is_published }),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.customPage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    return this.prisma.customPage.delete({ where: { id } });
  }

  /**
   * Seed the six legally-required + FAQ-style static pages that every
   * Indian e-commerce site needs: Privacy, Terms, Returns, Shipping,
   * About, Contact. Idempotent — creates only the slugs that don't
   * already exist, so running this twice is safe.
   */
  async seedDefaults() {
    const seeded: string[] = [];
    for (const page of DEFAULT_STATIC_PAGES) {
      const existing = await this.prisma.customPage.findUnique({ where: { slug: page.slug } });
      if (existing) continue;
      await this.prisma.customPage.create({
        data: {
          title: page.title,
          slug: page.slug,
          htmlContent: page.html,
          isPublished: true,
        },
      });
      seeded.push(page.slug);
    }
    return { seeded, skipped: DEFAULT_STATIC_PAGES.length - seeded.length };
  }
}

// ─── Default-content seeds ──────────────────────────────────────────────
// HTML kept simple (h2/h3/p/ul) so the admin WYSIWYG can round-trip it
// without mangling. Placeholders like {{brand}}/{{email}}/{{phone}}/{{address}}
// can be filled in once per site; we substitute sensible Gifteeng values
// here so the page is usable the moment it's seeded.
const BRAND   = "Gifteeng";
const EMAIL   = "support@gifteeng.com";
const PHONE   = "+91 98677 55441";
const ADDRESS = "Gifteeng, India";

type Seed = { title: string; slug: string; html: string };

const DEFAULT_STATIC_PAGES: Seed[] = [
  {
    title: "Privacy Policy",
    slug: "privacy-policy",
    html: `
<h2>Privacy Policy</h2>
<p>At <strong>${BRAND}</strong> we respect your privacy. This policy explains what data we collect, why we collect it, and how we use it.</p>

<h3>1. Information we collect</h3>
<ul>
  <li>Account info — name, email, phone number</li>
  <li>Shipping address + optional GST details</li>
  <li>Order history and payment metadata (via Razorpay — we never store card numbers)</li>
  <li>Usage analytics to improve the site</li>
</ul>

<h3>2. How we use it</h3>
<p>We use your data to fulfil orders, send shipping updates, run the Gifteeng rewards program, and occasionally share new-product emails (you can unsubscribe any time).</p>

<h3>3. Sharing</h3>
<p>We never sell your data. We share limited info only with shipping providers (Shiprocket), payment gateways (Razorpay), and statutory authorities when legally required.</p>

<h3>4. Cookies</h3>
<p>We use essential cookies to keep you signed in and analytics cookies to understand site performance. You can clear these from your browser any time.</p>

<h3>5. Your rights</h3>
<p>You can request a copy of your data, correction, or deletion of your account by writing to <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>

<h3>6. Contact</h3>
<p>Questions? Email <a href="mailto:${EMAIL}">${EMAIL}</a> or call ${PHONE}.</p>
`.trim(),
  },
  {
    title: "Terms and Conditions",
    slug: "terms-and-conditions",
    html: `
<h2>Terms and Conditions</h2>
<p>By using <strong>${BRAND}</strong> you agree to the terms below.</p>

<h3>1. Using the site</h3>
<p>You agree not to misuse the site, attempt to reverse-engineer our systems, or interfere with other customers' orders.</p>

<h3>2. Orders</h3>
<p>All orders are subject to acceptance. We may cancel an order before shipment if stock, pricing, or fraud issues arise; in that case we'll refund in full.</p>

<h3>3. Pricing and payment</h3>
<p>Prices are in Indian Rupees (₹) and include GST unless stated otherwise. Payment is processed securely via Razorpay; cash-on-delivery is available on eligible orders.</p>

<h3>4. Rewards programme (Goins)</h3>
<ul>
  <li>100 Goins = ₹1 of discount</li>
  <li>Max ₹25 (or 20% of cart, whichever is less) applied per order</li>
  <li>Goins expire 90 days after being earned</li>
  <li>${BRAND} reserves the right to freeze accounts that violate the spirit of the rewards programme</li>
</ul>

<h3>5. Customised products</h3>
<p>Orders with uploaded photos, text, or designs are personal to you and can't be cancelled or returned once production begins, unless there's a defect caused by us.</p>

<h3>6. Intellectual property</h3>
<p>All site content, designs, and code are the property of ${BRAND} unless otherwise noted.</p>

<h3>7. Limitation of liability</h3>
<p>To the extent allowed by law, ${BRAND}'s liability for any claim is limited to the amount you paid for the specific order in dispute.</p>

<h3>8. Governing law</h3>
<p>These terms are governed by the laws of India. Any dispute will be handled by courts having jurisdiction over our registered office.</p>

<h3>9. Contact</h3>
<p>For anything unclear, write to <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
`.trim(),
  },
  {
    title: "Shipping Policy",
    slug: "shipping-policy",
    html: `
<h2>Shipping Policy</h2>
<p>We ship pan-India via our courier partners.</p>

<h3>Dispatch time</h3>
<ul>
  <li>Standard (ready stock): 1–2 business days</li>
  <li>Personalised gifts: 2–4 business days (production time)</li>
  <li>Bulk / corporate orders: timelines shared on quote</li>
</ul>

<h3>Delivery time</h3>
<ul>
  <li>Metro cities: 2–4 business days after dispatch</li>
  <li>Rest of India: 4–7 business days after dispatch</li>
  <li>Northeast / remote pincodes: 5–10 business days</li>
</ul>

<h3>Shipping charges</h3>
<p>Orders above ₹499 ship free. Below that, a flat rate applies based on pincode, shown at checkout.</p>

<h3>Tracking</h3>
<p>Once dispatched we email + SMS you a tracking link. You can also track any order from the <a href="/track">Track Order</a> page using your order number.</p>

<h3>Undelivered packages</h3>
<p>If a package is returned undelivered we'll contact you to reship. After two failed attempts the order is cancelled and refunded minus shipping costs.</p>

<h3>Help</h3>
<p>Questions about a shipment? Email <a href="mailto:${EMAIL}">${EMAIL}</a> with your order number.</p>
`.trim(),
  },
  {
    title: "Returns and Refunds",
    slug: "returns-and-refunds",
    html: `
<h2>Returns and Refunds</h2>
<p>We want you to love your gift. Here's how returns work.</p>

<h3>Eligible returns</h3>
<ul>
  <li>Damaged in transit — notify us within 48 hours of delivery</li>
  <li>Wrong product received</li>
  <li>Defect caused by us on a non-personalised product</li>
</ul>

<h3>Not eligible</h3>
<ul>
  <li>Personalised / customised gifts (photos, names, messages printed) — unless defective</li>
  <li>Perishable items (food, flowers) after 24 hours of delivery</li>
  <li>Products with tampered packaging or missing original invoice</li>
</ul>

<h3>How to request a return</h3>
<ol>
  <li>Email <a href="mailto:${EMAIL}">${EMAIL}</a> within 7 days of delivery with your order number + photos.</li>
  <li>Our team confirms eligibility and arranges a reverse pickup.</li>
  <li>Once the item reaches us and passes inspection, we refund.</li>
</ol>

<h3>Refunds</h3>
<ul>
  <li>Prepaid orders — refunded to the original payment method within 5–7 business days</li>
  <li>COD orders — refunded via bank transfer to details you provide</li>
  <li>Goins used are returned to your wallet</li>
</ul>

<h3>Cancellations</h3>
<p>Orders can be cancelled free of charge until the item enters production. Personalised items enter production within 1 hour of order confirmation, so cancellation requests are time-sensitive — email us immediately.</p>
`.trim(),
  },
  {
    title: `About ${BRAND}`,
    slug: "about",
    html: `
<h2>About ${BRAND}</h2>
<p>${BRAND} is India's personalised gifting platform — where every product is made just for the person you have in mind.</p>

<h3>What we do</h3>
<p>From photo frames and mugs to MDF stands and corporate hampers, we produce custom gifts on demand and ship them anywhere in India. Browse thousands of products, customise with your own photos or messages, and watch the mockup update live before you order.</p>

<h3>Why us</h3>
<ul>
  <li><strong>Quality</strong> — premium materials, print-shop-grade printing, real people QA-checking every order</li>
  <li><strong>Speed</strong> — most orders ship within 48 hours</li>
  <li><strong>Fair pricing</strong> — no "middle-man markup", same price whether you order 1 or 100</li>
  <li><strong>Gifteeng Goins</strong> — earn rewards every time you shop, redeem against future orders</li>
</ul>

<h3>Corporate gifting</h3>
<p>We work with HRs and procurement teams to source, brand, and ship at scale. Visit <a href="/corporate">Corporate Orders</a> or email <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>

<h3>Say hi</h3>
<p>We'd love to hear from you. Drop us a note at <a href="mailto:${EMAIL}">${EMAIL}</a> or call ${PHONE}.</p>
`.trim(),
  },
  {
    title: "Contact Us",
    slug: "contact",
    html: `
<h2>Contact Us</h2>
<p>We'd love to help.</p>

<h3>Support</h3>
<p>For any order-related queries, product info, or custom-gift briefs:</p>
<ul>
  <li>Email: <a href="mailto:${EMAIL}">${EMAIL}</a></li>
  <li>Phone / WhatsApp: ${PHONE}</li>
  <li>Hours: Monday–Saturday, 10 AM – 7 PM IST</li>
</ul>

<h3>Corporate &amp; bulk orders</h3>
<p>HRs, marketing teams, event planners — we offer volume pricing, custom branding, and door-step delivery across India. Write to <a href="mailto:${EMAIL}">${EMAIL}</a> with your brief.</p>

<h3>Address</h3>
<p>${ADDRESS}</p>

<h3>Press</h3>
<p>For media enquiries, email <a href="mailto:${EMAIL}">${EMAIL}</a> with "Press" in the subject line.</p>
`.trim(),
  },
];
