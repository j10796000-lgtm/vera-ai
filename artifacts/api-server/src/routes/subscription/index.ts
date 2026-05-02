import { Router, Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { users } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "../../stripeClient";

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    (req as any).userId = userId;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};

async function getOrCreateUser(userId: string, email?: string) {
  const [existing] = await db.select().from(users).where(eq(users.id, userId));
  if (existing) return existing;
  const [created] = await db.insert(users).values({ id: userId, email: email ?? null }).returning();
  return created;
}

async function hasActiveSubscription(stripeSubscriptionId: string | null): Promise<boolean> {
  if (!stripeSubscriptionId) return false;
  try {
    const result = await db.execute(
      sql`SELECT status FROM stripe.subscriptions WHERE id = ${stripeSubscriptionId} LIMIT 1`
    );
    const sub = result.rows[0] as any;
    return sub?.status === "active" || sub?.status === "trialing";
  } catch {
    return false;
  }
}

const router = Router();
router.use(requireAuth);

router.get("/status", async (req, res) => {
  const userId = (req as any).userId;
  try {
    const user = await getOrCreateUser(userId);
    const isPro = await hasActiveSubscription(user.stripeSubscriptionId ?? null);
    res.json({ isPro });
  } catch {
    res.json({ isPro: false });
  }
});

router.post("/checkout", async (req, res) => {
  const userId = (req as any).userId;
  const auth = getAuth(req);
  try {
    const stripe = await getUncachableStripeClient();
    const user = await getOrCreateUser(userId);

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId },
        email: (auth as any)?.sessionClaims?.email ?? undefined,
      });
      await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, userId));
      customerId = customer.id;
    }

    const prices = await db.execute(
      sql`SELECT pr.id FROM stripe.prices pr JOIN stripe.products p ON pr.product = p.id WHERE p.active = true AND pr.active = true AND pr.recurring IS NOT NULL LIMIT 1`
    );
    const priceId = (prices.rows[0] as any)?.id;
    if (!priceId) {
      res.status(503).json({ error: "No active subscription plans found. Please set up Stripe products first." });
      return;
    }

    const origin = `${req.protocol}://${req.get("host")}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/app?pro=1`,
      cancel_url: `${origin}/app`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(503).json({ error: "Stripe not connected. Please complete the Stripe integration setup." });
  }
});

router.post("/portal", async (req, res) => {
  const userId = (req as any).userId;
  try {
    const stripe = await getUncachableStripeClient();
    const user = await getOrCreateUser(userId);
    if (!user.stripeCustomerId) { res.status(400).json({ error: "No Stripe customer found" }); return; }
    const origin = `${req.protocol}://${req.get("host")}`;
    const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${origin}/app` });
    res.json({ url: session.url });
  } catch {
    res.status(503).json({ error: "Stripe not connected." });
  }
});

export default router;
