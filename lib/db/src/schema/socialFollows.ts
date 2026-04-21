import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const socialFollows = pgTable(
  "social_follows",
  {
    id: serial("id").primaryKey(),
    followerId: text("follower_id").notNull(),
    followingId: text("following_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.followerId, table.followingId)],
);

export type SocialFollow = typeof socialFollows.$inferSelect;
