import type { ZodType } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { CostTracker } from "@/lib/agent/cost";
import type { log } from "@/lib/observability/logger";

/**
 * RunContext is the ambient state a Run carries: who it's for, the DB handle,
 * the cost meter, and the logger (PRD §5.1). Authed integration clients are
 * loaded on demand by the tools via userId, so they're not pre-built here.
 */
export interface RunContext {
  userId: string;
  db: PrismaClient;
  cost: CostTracker;
  log: typeof log;
}

/**
 * A tool is a pure server function with a typed input. Defined once, runnable
 * in isolation. `requiresApproval` pauses the loop before execution (web
 * search, email send, CRM writes) — read-only tools leave it unset.
 */
export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  schema: ZodType<I>;
  requiresApproval?: boolean;
  execute(input: I, ctx: RunContext): Promise<O>;
}
