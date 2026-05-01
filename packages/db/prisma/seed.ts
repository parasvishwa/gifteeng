import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Minimal seed — demonstrates both silos and a shared product.
  const acme = await prisma.company.upsert({
    where: { slug: "acme" },
    update: {},
    create: {
      name: "Acme Corp",
      slug: "acme",
      status: "active",
    },
  });

  const mug = await prisma.product.upsert({
    where: { slug: "classic-ceramic-mug" },
    update: {},
    create: {
      slug: "classic-ceramic-mug",
      title: "Classic Ceramic Mug",
      description: "325ml white ceramic mug, customizable.",
      category: "mug",
      basePrice: "199.00",
      inventory: 500,
      isCustomizable: true,
      b2cEnabled: true,
      b2bEnabled: true,
    },
  });

  await prisma.companyProduct.upsert({
    where: {
      companyId_productId: { companyId: acme.id, productId: mug.id },
    },
    update: {},
    create: {
      companyId: acme.id,
      productId: mug.id,
      overridePrice: "149.00",
    },
  });

  await prisma.wallet.upsert({
    where: {
      ownerType_companyId_companyUserId: {
        ownerType: "company",
        companyId: acme.id,
        companyUserId: null as unknown as string,
      },
    },
    update: {},
    create: {
      ownerType: "company",
      companyId: acme.id,
      balance: "100000.00",
    },
  });

  console.log("Seed complete:", { company: acme.slug, product: mug.slug });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
