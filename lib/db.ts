import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. Next's dev server hot-reloads modules, which would
 * otherwise spawn a new client (and a new connection pool) on every reload and
 * exhaust the database. We cache it on globalThis in non-production.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
