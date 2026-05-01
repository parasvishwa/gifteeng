import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type CreateReviewInput = {
  productId: string;
  rating: number;
  title?: string;
  body?: string;
  text?: string;
  photoUrls?: string[];
  videoUrl?: string;
};

// We use a caption discriminator on CustomerPhoto rows to distinguish images
// from short video clips, since the Review schema does not carry a dedicated
// video column. `__video__` is reserved for review video attachments.
const REVIEW_VIDEO_CAPTION = "__video__";

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Like listApproved but ALSO returns any pending reviews authored by the
   * requesting customer. Each row carries `pending: true` so the frontend
   * can render a "Pending approval" badge on the user's own pending review,
   * giving them visual confirmation that their submission was saved.
   *
   * Always includes a `reviewer` block with the customer's first name so the
   * UI never shows "Anonymous". For privacy we only expose the FIRST name
   * (e.g. "Paras V.") — never the full name + last initial.
   */
  async listApprovedWithOwnPending(productId: string, requesterId?: string) {
    const where = requesterId
      ? {
          productId,
          OR: [
            { isApproved: true },
            { customerId: requesterId, isApproved: false },
          ],
        }
      : { productId, isApproved: true };

    const rows = await this.prisma.review.findMany({
      where,
      include: {
        photos: true,
        customer: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => {
      const videoPhoto = r.photos.find((p) => p.caption === REVIEW_VIDEO_CAPTION);
      const imagePhotos = r.photos.filter((p) => p.caption !== REVIEW_VIDEO_CAPTION);
      // Privacy-respecting display name: "Paras V." instead of full name.
      const fullName = r.customer?.fullName?.trim();
      const parts = (fullName ?? "").split(/\s+/).filter(Boolean);
      const displayName = parts.length === 0
        ? "Verified buyer"
        : parts.length === 1
          ? parts[0]!
          : `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;

      return {
        ...r,
        image_url:    imagePhotos[0]?.url ?? null,
        video_url:    videoPhoto?.url ?? null,
        photos:       imagePhotos,
        pending:      !r.isApproved,
        // New convenience fields surfaced to the frontend so it never has to
        // fall back to "Anonymous".
        reviewer:     {
          name:      displayName,
          avatarUrl: r.customer?.avatarUrl ?? null,
          isOwn:     requesterId !== undefined && r.customerId === requesterId,
        },
      };
    });
  }

  async listApproved(productId?: string, limit?: number) {
    const rows = await this.prisma.review.findMany({
      where: {
        isApproved: true,
        ...(productId ? { productId } : {}),
      },
      include: {
        photos: true,
        customer: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      ...(limit && limit > 0 ? { take: limit } : {}),
    });
    return rows.map((r) => {
      const videoPhoto = r.photos.find((p) => p.caption === REVIEW_VIDEO_CAPTION);
      const imagePhotos = r.photos.filter((p) => p.caption !== REVIEW_VIDEO_CAPTION);
      // Privacy-friendly display name (matches listApprovedWithOwnPending)
      const fullName = (r as any).customer?.fullName?.trim();
      const parts = (fullName ?? "").split(/\s+/).filter(Boolean);
      const displayName = parts.length === 0
        ? "Verified buyer"
        : parts.length === 1
          ? parts[0]!
          : `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
      return {
        ...r,
        image_url: imagePhotos[0]?.url ?? null,
        video_url: videoPhoto?.url ?? null,
        photos: imagePhotos,
        reviewer: {
          name:      displayName,
          avatarUrl: (r as any).customer?.avatarUrl ?? null,
        },
      };
    });
  }

  async listAll(take = 200) {
    const rows = await this.prisma.review.findMany({
      take,
      include: {
        photos: true,
        product: { select: { id: true, title: true, slug: true } },
        customer: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      product_id: r.productId,
      product_title: r.product?.title ?? null,
      name: r.customer?.fullName || r.customer?.email?.split("@")[0] || "Anonymous",
      rating: r.rating,
      text: r.body || r.title || "",
      date_label: r.createdAt.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      image_url: (r.photos?.find((p: any) => p.caption !== REVIEW_VIDEO_CAPTION) as any)?.url ?? null,
      video_url: (r.photos?.find((p: any) => p.caption === REVIEW_VIDEO_CAPTION) as any)?.url ?? null,
      helpful: 0,
      verified: false,
      is_active: r.isApproved,
      sort_order: 0,
    }));
  }

  async updateAdmin(id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    const { rating, title, body, text, isApproved, image_url, video_url, photoUrls } = data as any;

    // Media sync — when admin supplies image_url / video_url, we replace the
    // matching CustomerPhoto rows for this review.
    if (image_url !== undefined || photoUrls !== undefined) {
      const urls: string[] = Array.isArray(photoUrls)
        ? photoUrls
        : typeof image_url === "string" && image_url
          ? [image_url]
          : [];
      await this.prisma.customerPhoto.deleteMany({
        where: { reviewId: id, NOT: { caption: REVIEW_VIDEO_CAPTION } },
      });
      if (urls.length > 0) {
        await this.prisma.customerPhoto.createMany({
          data: urls.map((url) => ({ reviewId: id, url, caption: null })),
        });
      }
    }
    if (video_url !== undefined) {
      await this.prisma.customerPhoto.deleteMany({
        where: { reviewId: id, caption: REVIEW_VIDEO_CAPTION },
      });
      if (typeof video_url === "string" && video_url.length > 0) {
        await this.prisma.customerPhoto.create({
          data: { reviewId: id, url: video_url, caption: REVIEW_VIDEO_CAPTION },
        });
      }
    }

    return this.prisma.review.update({
      where: { id },
      data: {
        ...(rating !== undefined && { rating: Number(rating) }),
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        ...(body === undefined && text !== undefined && { body: text }),
        ...(isApproved !== undefined && { isApproved: Boolean(isApproved) }),
      },
    });
  }

  async create(customerId: string, input: CreateReviewInput) {
    // Auto-approval: customers who have placed at least one non-cancelled
    // order are trusted enough to skip the moderation queue. Brand-new users
    // (no order yet) still go through admin approval as a spam gate.
    //
    // This solves the "I submitted a review but it doesn't appear" UX issue
    // for the >90% case of real customers, while keeping a wall against
    // throwaway-account spam from accounts that never bought anything.
    const verifiedOrderCount = await this.prisma.order.count({
      where: {
        customerId,
        status: { not: "cancelled" },
      },
    });
    const autoApprove = verifiedOrderCount > 0;

    const review = await this.prisma.review.create({
      data: {
        productId: input.productId,
        customerId,
        rating: input.rating,
        title: input.title,
        body: input.body ?? input.text,
        isApproved: autoApprove,
      },
    });

    // Persist attached media as CustomerPhoto rows keyed to this review.
    const photoRows: Array<{ reviewId: string; customerId: string; url: string; caption: string | null }> = [];
    if (Array.isArray(input.photoUrls)) {
      for (const url of input.photoUrls) {
        if (typeof url === "string" && url.length > 0) {
          photoRows.push({ reviewId: review.id, customerId, url, caption: null });
        }
      }
    }
    if (input.videoUrl && typeof input.videoUrl === "string" && input.videoUrl.length > 0) {
      photoRows.push({
        reviewId: review.id,
        customerId,
        url: input.videoUrl,
        caption: REVIEW_VIDEO_CAPTION,
      });
    }
    if (photoRows.length > 0) {
      await this.prisma.customerPhoto.createMany({ data: photoRows });
    }
    return review;
  }

  async approve(id: string) {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    return this.prisma.review.update({ where: { id }, data: { isApproved: true } });
  }

  async remove(id: string) {
    const existing = await this.prisma.review.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    return this.prisma.review.delete({ where: { id } });
  }
}
