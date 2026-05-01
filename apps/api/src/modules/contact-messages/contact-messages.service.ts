import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const ALLOWED_STATUSES = ["new", "read", "replied", "archived"] as const;
export type ContactStatus = (typeof ALLOWED_STATUSES)[number];

export type ContactCreateInput = {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  body: string;
};

@Injectable()
export class ContactMessagesService {
  constructor(private prisma: PrismaService) {}

  create(input: ContactCreateInput): Promise<unknown> {
    return this.prisma.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        subject: input.subject,
        body: input.body,
      },
    });
  }

  async list(params: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: unknown[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contactMessage.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async updateStatus(id: string, status: string): Promise<unknown> {
    if (!ALLOWED_STATUSES.includes(status as ContactStatus)) {
      throw new BadRequestException(`Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}`);
    }
    const existing = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Contact message not found");
    return this.prisma.contactMessage.update({ where: { id }, data: { status } });
  }

  async remove(id: string): Promise<unknown> {
    const existing = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Contact message not found");
    return this.prisma.contactMessage.delete({ where: { id } });
  }
}
