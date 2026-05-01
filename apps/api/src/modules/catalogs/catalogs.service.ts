import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AuthB2bService } from "../auth-b2b/auth-b2b.service";

const ALLOWED_STATUSES = ["new", "contacted", "quoted", "closed", "converted"] as const;
export type EnquiryStatus = (typeof ALLOWED_STATUSES)[number];

export type SubmitEnquiryInput = {
  catalogSlug?: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  companyName?: string;
  message?: string;
  requestedItems?: Array<{ productId: string; qty?: number; notes?: string }>;
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "company"
  );
}

@Injectable()
export class CatalogsService {
  private readonly log = new Logger(CatalogsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private authB2b: AuthB2bService,
  ) {}

  listPublished() {
    return this.prisma.catalog.findMany({
      where: { isPublished: true },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { product: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getBySlug(slug: string) {
    const catalog = await this.prisma.catalog.findUnique({
      where: { slug },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { product: true },
        },
      },
    });
    if (!catalog) throw new NotFoundException("Catalog not found");
    return catalog;
  }

  async submitEnquiry(input: SubmitEnquiryInput) {
    let catalogId: string | undefined;
    if (input.catalogSlug) {
      const catalog = await this.prisma.catalog.findUnique({
        where: { slug: input.catalogSlug },
        select: { id: true },
      });
      if (!catalog) throw new NotFoundException("Catalog not found");
      catalogId = catalog.id;
    }

    const enquiry = await this.prisma.catalogEnquiry.create({
      data: {
        catalogId,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        companyName: input.companyName,
        message: input.message,
        requestedItems: input.requestedItems ?? undefined,
        status: "new",
      },
    });

    const inbox = process.env.LEADS_INBOX;
    const subject = `New catalog enquiry from ${input.contactName}`;
    const html = `
      <h2>New catalog enquiry</h2>
      <p><strong>Name:</strong> ${input.contactName}</p>
      <p><strong>Email:</strong> ${input.contactEmail}</p>
      ${input.contactPhone ? `<p><strong>Phone:</strong> ${input.contactPhone}</p>` : ""}
      ${input.companyName ? `<p><strong>Company:</strong> ${input.companyName}</p>` : ""}
      ${input.catalogSlug ? `<p><strong>Catalog:</strong> ${input.catalogSlug}</p>` : ""}
      ${input.message ? `<p><strong>Message:</strong><br/>${input.message}</p>` : ""}
      <p>Enquiry ID: ${enquiry.id}</p>
    `;
    if (inbox) {
      await this.notifications.sendEmail(inbox, subject, html);
    } else {
      this.log.warn(`[DEV] No LEADS_INBOX set. Would email: ${subject}`);
    }

    return enquiry;
  }

  listEnquiries(status?: string) {
    return this.prisma.catalogEnquiry.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { catalog: { select: { id: true, slug: true, title: true } } },
    });
  }

  async getEnquiry(id: string) {
    const enquiry = await this.prisma.catalogEnquiry.findUnique({
      where: { id },
      include: {
        catalog: {
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
              include: { product: true },
            },
          },
        },
      },
    });
    if (!enquiry) throw new NotFoundException("Enquiry not found");
    return enquiry;
  }

  async markStatus(id: string, status: string) {
    if (!ALLOWED_STATUSES.includes(status as EnquiryStatus)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    const existing = await this.prisma.catalogEnquiry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Enquiry not found");
    return this.prisma.catalogEnquiry.update({
      where: { id },
      data: { status },
    });
  }

  private async uniqueSlug(base: string): Promise<string> {
    const baseSlug = slugify(base);
    let candidate = baseSlug;
    let n = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const hit = await this.prisma.company.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!hit) return candidate;
      candidate = `${baseSlug}-${n}`;
      n += 1;
    }
  }

  async createCatalog(input: {
    slug: string;
    title: string;
    description?: string;
    heroImage?: string;
    isPublished?: boolean;
  }) {
    return this.prisma.catalog.create({
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        heroImage: input.heroImage,
        isPublished: input.isPublished ?? true,
      },
    });
  }

  async updateCatalog(
    id: string,
    input: {
      slug?: string;
      title?: string;
      description?: string;
      heroImage?: string;
      isPublished?: boolean;
    },
  ) {
    const existing = await this.prisma.catalog.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Catalog not found");
    return this.prisma.catalog.update({
      where: { id },
      data: {
        slug: input.slug,
        title: input.title,
        description: input.description,
        heroImage: input.heroImage,
        isPublished: input.isPublished,
      },
    });
  }

  async addCatalogItems(catalogId: string, productIds: string[]) {
    const existing = await this.prisma.catalog.findUnique({ where: { id: catalogId } });
    if (!existing) throw new NotFoundException("Catalog not found");
    return this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const productId of productIds) {
        const row = await tx.catalogItem.upsert({
          where: { catalogId_productId: { catalogId, productId } },
          create: { catalogId, productId },
          update: {},
        });
        created.push(row);
      }
      return created;
    });
  }

  async removeCatalogItem(itemId: string) {
    const existing = await this.prisma.catalogItem.findUnique({ where: { id: itemId } });
    if (!existing) throw new NotFoundException("Catalog item not found");
    return this.prisma.catalogItem.delete({ where: { id: itemId } });
  }

  async convertToCompany(id: string, actorCompanyUserId: string) {
    const enquiry = await this.prisma.catalogEnquiry.findUnique({ where: { id } });
    if (!enquiry) throw new NotFoundException("Enquiry not found");
    if (enquiry.status === "converted") {
      throw new ConflictException("Enquiry already converted");
    }

    const nameBase = enquiry.companyName?.trim() || enquiry.contactName.trim();
    const slug = await this.uniqueSlug(nameBase);

    const result = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: nameBase,
          slug,
          billingEmail: enquiry.contactEmail,
          status: "active",
        },
      });

      await tx.wallet.create({
        data: {
          ownerType: "company",
          companyId: company.id,
          balance: 0,
          lockedBalance: 0,
        },
      });

      const note = `\n\n[converted to company ${company.id} (${company.slug}) at ${new Date().toISOString()}]`;
      const updatedEnquiry = await tx.catalogEnquiry.update({
        where: { id: enquiry.id },
        data: {
          status: "converted",
          message: (enquiry.message ?? "") + note,
        },
      });

      return { company, enquiry: updatedEnquiry };
    });

    const invite = await this.authB2b.invite(result.company.id, actorCompanyUserId, {
      email: enquiry.contactEmail,
      fullName: enquiry.contactName,
      role: "hr_admin",
    });

    return {
      company: result.company,
      enquiry: result.enquiry,
      invite: { companyUserId: invite.id },
    };
  }
}
