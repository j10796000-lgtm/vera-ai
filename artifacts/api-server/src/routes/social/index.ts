import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { socialPosts, socialFollows } from "@workspace/db";
import { getAuth, clerkClient } from "@clerk/express";
import { eq, and, desc, inArray } from "drizzle-orm";

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).userId = userId;
  next();
};

async function getClerkDisplayName(userId: string): Promise<{ name: string; imageUrl: string | null }> {
  try {
    const user = await clerkClient().users.getUser(userId);
    const name =
      user.firstName
        ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}`.trim()
        : user.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "Anonymous";
    return { name, imageUrl: user.imageUrl ?? null };
  } catch {
    return { name: "Anonymous", imageUrl: null };
  }
}

const router = Router();
router.use(requireAuth);

router.get("/feed", async (req, res) => {
  const userId = (req as any).userId;

  const following = await db
    .select({ followingId: socialFollows.followingId })
    .from(socialFollows)
    .where(eq(socialFollows.followerId, userId));

  const followingIds = following.map((f) => f.followingId);
  const allRelevantIds = [...new Set([userId, ...followingIds])];

  const posts =
    allRelevantIds.length > 0
      ? await db
          .select()
          .from(socialPosts)
          .where(inArray(socialPosts.userId, allRelevantIds))
          .orderBy(desc(socialPosts.createdAt))
          .limit(100)
      : await db
          .select()
          .from(socialPosts)
          .orderBy(desc(socialPosts.createdAt))
          .limit(100);

  const followingSet = new Set(followingIds);
  const postsWithMeta = posts.map((p) => ({
    ...p,
    isOwn: p.userId === userId,
    isFollowing: followingSet.has(p.userId),
  }));

  res.json(postsWithMeta);
});

router.get("/discover", async (req, res) => {
  const userId = (req as any).userId;

  const following = await db
    .select({ followingId: socialFollows.followingId })
    .from(socialFollows)
    .where(eq(socialFollows.followerId, userId));

  const followingSet = new Set(following.map((f) => f.followingId));

  const posts = await db
    .select()
    .from(socialPosts)
    .orderBy(desc(socialPosts.createdAt))
    .limit(100);

  const postsWithMeta = posts.map((p) => ({
    ...p,
    isOwn: p.userId === userId,
    isFollowing: followingSet.has(p.userId),
  }));

  res.json(postsWithMeta);
});

router.post("/posts", async (req, res) => {
  const userId = (req as any).userId;
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
  if (!content || content.length > 2000) {
    res.status(400).json({ error: "Invalid content" });
    return;
  }

  const { name, imageUrl } = await getClerkDisplayName(userId);

  const [post] = await db
    .insert(socialPosts)
    .values({
      userId,
      userName: name,
      userImageUrl: imageUrl,
      content,
    })
    .returning();

  res.status(201).json({ ...post, isOwn: true, isFollowing: false });
});

router.delete("/posts/:id", async (req, res) => {
  const userId = (req as any).userId;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deleted] = await db
    .delete(socialPosts)
    .where(and(eq(socialPosts.id, id), eq(socialPosts.userId, userId)))
    .returning();

  if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

router.get("/profile/:userId", async (req, res) => {
  const myUserId = (req as any).userId;
  const targetUserId = req.params.userId;

  const [posts, followersRes, followingRes, myFollowRes] = await Promise.all([
    db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.userId, targetUserId))
      .orderBy(desc(socialPosts.createdAt))
      .limit(50),
    db.select().from(socialFollows).where(eq(socialFollows.followingId, targetUserId)),
    db.select().from(socialFollows).where(eq(socialFollows.followerId, targetUserId)),
    db
      .select()
      .from(socialFollows)
      .where(and(eq(socialFollows.followerId, myUserId), eq(socialFollows.followingId, targetUserId))),
  ]);

  const { name, imageUrl } = await getClerkDisplayName(targetUserId);

  res.json({
    userId: targetUserId,
    userName: name,
    userImageUrl: imageUrl,
    followersCount: followersRes.length,
    followingCount: followingRes.length,
    isFollowing: myFollowRes.length > 0,
    isOwn: myUserId === targetUserId,
    posts: posts.map((p) => ({ ...p, isOwn: p.userId === myUserId, isFollowing: myFollowRes.length > 0 })),
  });
});

router.post("/follow/:userId", async (req, res) => {
  const myUserId = (req as any).userId;
  const targetUserId = req.params.userId;

  if (myUserId === targetUserId) {
    res.status(400).json({ error: "Cannot follow yourself" });
    return;
  }

  await db
    .insert(socialFollows)
    .values({ followerId: myUserId, followingId: targetUserId })
    .onConflictDoNothing();

  res.status(200).json({ following: true });
});

router.delete("/follow/:userId", async (req, res) => {
  const myUserId = (req as any).userId;
  const targetUserId = req.params.userId;

  await db
    .delete(socialFollows)
    .where(
      and(
        eq(socialFollows.followerId, myUserId),
        eq(socialFollows.followingId, targetUserId),
      ),
    );

  res.status(200).json({ following: false });
});

export default router;
