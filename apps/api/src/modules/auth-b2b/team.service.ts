// ─── TeamService ─────────────────────────────────────────────────────────────
//
// Team-member CRUD scoped to the caller's company. Powers the
// `b2b/super-admin/team` admin page: list, invite, edit role/permissions,
// deactivate.
//
// Invite flow (updated — see docs/SECURITY_AUDIT.md C-3):
//   1. super-admin POSTs { email, role, permissions[] } to /b2b/team/invite.
//   2. We create the CompanyUser row WITHOUT a passwordHash. Instead we
//      generate a 32-byte random invite token, store only its sha256 in the
//      DB, and return the plaintext token + a ready-to-share invite URL
//      ONCE in the response.
//   3. The invitee opens the URL — frontend POSTs `{ token, password }` to
//      /auth/b2b/accept-invite. The API looks up by `inviteTokenHash`, sets
//      passwordHash, clears the token columns, and activates the account.
//
// Why this is materially safer than the old "temp password" flow:
//   - The token is tied to a specific row, not the email — guessing an
//     invited user's email no longer lets you claim their account.
//   - The token expires (default 7 days) and is single-use.
//   - The plaintext token never lives in the DB; even a full DB leak
//     doesn't yield usable invite links.
//   - resetPassword() uses the same token mechanism, so admin-triggered
//     password resets also avoid the temp-password leak path.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import type { UserRole } from "@gifteeng/shared";
import { ALL_PERMISSIONS, effectivePermissions } from "./permissions";

// 7 days. Long enough to land in a busy operator's inbox, short enough to
// limit the blast radius of a leaked invite link.
const INVITE_TTL_DAYS = 7;

// Helper: 32-byte cryptographic random → URL-safe base64 (no padding).
function generateInviteToken(): { plaintext: string; hash: string } {
  const raw = crypto.randomBytes(32);
  const plaintext = raw.toString("base64url");
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

function hashToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

// The shareable invite URL the admin copies. Front-end accept-invite page
// lives at /super-admin/accept-invite (handles both b2b and b2c hosts via
// middleware rewriting). Falls back to a relative path if no site URL is
// configured so dev still works.
function buildInviteUrl(token: string): string {
  const base = (process.env.PUBLIC_ADMIN_URL ?? process.env.PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${base}/super-admin/accept-invite?token=${encodeURIComponent(token)}`;
}

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService) {}

  async list(companyId: string) {
    const rows = await this.prisma.companyUser.findMany({
      where: { companyId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        permissions: true,
        invitedAt: true,
        activatedAt: true,
        lastLoginAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((r) => ({
      ...r,
      effectivePermissions: effectivePermissions(r.role, r.permissions),
    }));
  }

  async invite(
    companyId: string,
    inviterId: string,
    input: {
      email: string;
      role: UserRole;
      fullName?: string;
      phone?: string;
      permissions?: string[];
    },
  ): Promise<{ id: string; inviteUrl: string; expiresAt: Date }> {
    const email = (input.email ?? "").trim().toLowerCase();
    if (!email) throw new BadRequestException("Email required");
    if (!input.role) throw new BadRequestException("Role required");

    // Validate permissions against the catalog so we never persist garbage.
    const cleanPerms = (input.permissions ?? []).filter((p) =>
      ALL_PERMISSIONS.includes(p as never),
    );

    // Email must be unique within the company.
    const dup = await this.prisma.companyUser.findFirst({
      where: { companyId, email },
      select: { id: true },
    });
    if (dup) {
      throw new BadRequestException("A team member with this email already exists");
    }

    // Single-use invite token. plaintext goes to the admin (and into the
    // shared URL); only the sha256 hash is persisted.
    const { plaintext, hash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const created = await this.prisma.companyUser.create({
      data: {
        companyId,
        email,
        fullName:             input.fullName ?? null,
        phone:                input.phone ?? null,
        role:                 input.role,
        permissions:          cleanPerms,
        // No passwordHash yet — set when the user accepts the invite.
        passwordHash:         null,
        inviteTokenHash:      hash,
        inviteTokenExpiresAt: expiresAt,
        invitedBy:            inviterId,
        invitedAt:            new Date(),
        // Inactive until the invite is accepted so a half-onboarded row
        // can't be used to authenticate even if (somehow) a stray
        // passwordHash got set out-of-band.
        isActive:             false,
      },
      select: { id: true },
    });

    return { id: created.id, inviteUrl: buildInviteUrl(plaintext), expiresAt };
  }

  // Re-issue invite for a user whose link expired / was lost. Same row, new
  // token. Only valid for users without a passwordHash (i.e. never accepted).
  async resendInvite(
    companyId: string,
    userId: string,
  ): Promise<{ inviteUrl: string; expiresAt: Date }> {
    const u = await this.prisma.companyUser.findFirst({
      where: { id: userId, companyId },
      select: { id: true, passwordHash: true },
    });
    if (!u) throw new NotFoundException("Team member not found");
    if (u.passwordHash) {
      throw new BadRequestException(
        "User has already accepted their invite. Use Reset Password instead.",
      );
    }
    const { plaintext, hash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.companyUser.update({
      where: { id: u.id },
      data: { inviteTokenHash: hash, inviteTokenExpiresAt: expiresAt },
    });
    return { inviteUrl: buildInviteUrl(plaintext), expiresAt };
  }

  // Consume an invite token: verify hash + expiry + unused, then set the
  // user's passwordHash, mark active, and clear the token columns. Atomic.
  async acceptInvite(token: string, password: string): Promise<{ id: string; email: string }> {
    if (!token || token.length < 16) throw new BadRequestException("Invalid invite token");
    if (!password || password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
    const hash = hashToken(token);
    const user = await this.prisma.companyUser.findFirst({
      where: {
        inviteTokenHash: hash,
        inviteTokenExpiresAt: { gt: new Date() },
        passwordHash: null,
      },
      select: { id: true, email: true },
    });
    if (!user) throw new BadRequestException("Invite is invalid or has expired");
    const passwordHash = await argon2.hash(password);
    await this.prisma.companyUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        isActive:             true,
        activatedAt:          new Date(),
        // Wipe the token columns — single-use enforced at the DB level
        // (a second accept-call won't find the row again).
        inviteTokenHash:      null,
        inviteTokenExpiresAt: null,
      },
    });
    return { id: user.id, email: user.email };
  }

  async update(
    companyId: string,
    userId: string,
    input: {
      role?: UserRole;
      permissions?: string[];
      isActive?: boolean;
      fullName?: string;
      phone?: string;
    },
  ) {
    const existing = await this.prisma.companyUser.findFirst({
      where: { id: userId, companyId },
      select: { id: true, role: true },
    });
    if (!existing) throw new NotFoundException("Team member not found");

    const cleanPerms = input.permissions
      ? input.permissions.filter((p) => ALL_PERMISSIONS.includes(p as never))
      : undefined;

    return this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        ...(input.role        !== undefined ? { role: input.role } : {}),
        ...(cleanPerms        !== undefined ? { permissions: cleanPerms } : {}),
        ...(input.isActive    !== undefined ? { isActive: input.isActive } : {}),
        ...(input.fullName    !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone       !== undefined ? { phone: input.phone } : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        isActive: true,
      },
    });
  }

  async deactivate(companyId: string, userId: string) {
    return this.update(companyId, userId, { isActive: false });
  }

  // Admin-triggered password reset — uses the same single-use token flow as
  // invite() so we never return plaintext passwords from the API. The
  // existing passwordHash is nulled so login attempts fail until the link
  // is consumed; the user must accept the reset before they can sign in.
  async resetPassword(
    companyId: string,
    userId: string,
  ): Promise<{ inviteUrl: string; expiresAt: Date }> {
    const user = await this.prisma.companyUser.findFirst({
      where: { id: userId, companyId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("Team member not found");
    const { plaintext, hash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        passwordHash:         null,
        activatedAt:          null,
        inviteTokenHash:      hash,
        inviteTokenExpiresAt: expiresAt,
      },
    });
    return { inviteUrl: buildInviteUrl(plaintext), expiresAt };
  }
}
