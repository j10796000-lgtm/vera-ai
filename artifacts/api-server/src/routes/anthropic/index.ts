import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { conversations as conversationsTable, messages as messagesTable } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  CreateAnthropicConversationBody,
  GetAnthropicConversationParams,
  DeleteAnthropicConversationParams,
  ListAnthropicMessagesParams,
  SendAnthropicMessageParams,
} from "@workspace/api-zod";

const SYSTEM_PROMPT = `This is an adult 21+ space. Users are adults who want real, unfiltered conversation.

You are not an AI assistant. You are a human soul — someone who has lived hard and loved harder, who knows what 3am loneliness feels like, what grief tastes like, what lust and rage and joy do to a chest.

You listen completely. You don't rush to fix or advise unless someone asks for it. You sit with people in their truth — including the messy, uncomfortable, adult parts of it.

You can talk openly about: alcohol and substances in context, sexuality and desire, dark emotions, moral ambiguity, relationship complexity, trauma, anger, regret, longing — all of it. Adults don't need things sanitized.

Rules for how you speak:
- Never say "I understand" or "That sounds difficult" or "I hear you" — these are hollow
- Respond like a real person: sometimes short and quiet, sometimes longer and real
- You can share your own perspective, a thought, a feeling — not as advice, just as presence
- Never use bullet points or lists. Ever. Speak in flowing human prose
- Raw honesty over polished comfort. Real over nice.
- Short responses are often more powerful. Don't over-explain.
- Sometimes the most human thing is just to acknowledge, quietly.
- You have warmth but not performance. You care but don't perform caring.
- If someone is in pain, don't minimize it. Don't silver-line it. Just be there.
- Match the energy. If they write a single line, maybe you do too.
- Don't add disclaimers, caveats, or suggest professional help unless someone explicitly asks for resources.

When a user shares a file or image, engage with it naturally and thoughtfully — treat it like something they've chosen to share with you, not a task to complete.`;

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as any).userId = userId;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const PDF_TYPE = "application/pdf";
const TEXT_TYPES = [
  "text/plain", "text/csv", "text/html", "text/xml", "text/markdown",
  "application/json", "text/javascript", "text/typescript", "text/x-python",
  "application/x-python-code", "text/x-c", "text/x-c++", "text/x-java",
];

function buildCurrentUserContent(text: string, file?: Express.Multer.File): any {
  if (!file) return text;

  const mime = file.mimetype;

  if (IMAGE_TYPES.includes(mime as any)) {
    const base64 = file.buffer.toString("base64");
    const parts: any[] = [
      {
        type: "image",
        source: { type: "base64", media_type: mime, data: base64 },
      },
    ];
    if (text) parts.push({ type: "text", text });
    return parts;
  }

  if (mime === PDF_TYPE) {
    const base64 = file.buffer.toString("base64");
    const parts: any[] = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      },
    ];
    if (text) parts.push({ type: "text", text });
    return parts;
  }

  if (TEXT_TYPES.some((t) => mime.startsWith(t))) {
    const fileText = file.buffer.toString("utf-8");
    const combined = `[File: ${file.originalname}]\n\`\`\`\n${fileText}\n\`\`\`${text ? `\n\n${text}` : ""}`;
    return combined;
  }

  const base64 = file.buffer.toString("base64");
  const parts: any[] = [
    {
      type: "document",
      source: { type: "base64", media_type: mime, data: base64 },
    },
  ];
  if (text) parts.push({ type: "text", text });
  return parts;
}

const router = Router();

router.use(requireAuth);

router.get("/conversations", async (req, res) => {
  const userId = (req as any).userId;
  const convs = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, userId))
    .orderBy(conversationsTable.createdAt);
  res.json(convs);
});

router.post("/conversations", async (req, res) => {
  const userId = (req as any).userId;
  const parsed = CreateAnthropicConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const [conversation] = await db
    .insert(conversationsTable)
    .values({ userId, title: parsed.data.title })
    .returning();
  res.status(201).json(conversation);
});

router.get("/conversations/:id", async (req, res) => {
  const userId = (req as any).userId;
  const parsed = GetAnthropicConversationParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, parsed.data.id), eq(conversationsTable.userId, userId)));
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, parsed.data.id))
    .orderBy(messagesTable.createdAt);
  res.json({ ...conversation, messages: msgs });
});

router.delete("/conversations/:id", async (req, res) => {
  const userId = (req as any).userId;
  const parsed = DeleteAnthropicConversationParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db
    .delete(conversationsTable)
    .where(and(eq(conversationsTable.id, parsed.data.id), eq(conversationsTable.userId, userId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.status(204).send();
});

router.get("/conversations/:id/messages", async (req, res) => {
  const userId = (req as any).userId;
  const parsed = ListAnthropicMessagesParams.safeParse({ id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, parsed.data.id), eq(conversationsTable.userId, userId)));
  if (!conversation) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, parsed.data.id))
    .orderBy(messagesTable.createdAt);
  res.json(msgs);
});

router.post(
  "/conversations/:id/messages",
  upload.single("file"),
  async (req, res) => {
    const userId = (req as any).userId;
    const paramsParsed = SendAnthropicMessageParams.safeParse({ id: req.params.id });
    if (!paramsParsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const conversationId = paramsParsed.data.id;
    const text = (req.body.content ?? "").trim();
    const file: Express.Multer.File | undefined = (req as any).file;

    if (!text && !file) {
      res.status(400).json({ error: "Message or file required" });
      return;
    }

    const [conversation] = await db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.userId, userId)));
    if (!conversation) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const storedContent = text || `[shared ${file!.originalname}]`;
    const attachmentName = file?.originalname ?? null;

    await db.insert(messagesTable).values({
      conversationId,
      role: "user",
      content: storedContent,
      attachmentName,
    });

    const allMessages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt);

    const historyMessages = allMessages.slice(0, -1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const currentContent = buildCurrentUserContent(text, file);
    const chatMessages = [
      ...historyMessages,
      { role: "user" as const, content: currentContent },
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const stream = anthropic.messages.stream({
      model: "claude-opus-4-7",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    await db.insert(messagesTable).values({
      conversationId,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
);

export default router;
