import { Router, Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  (req as any).userId = userId;
  next();
};

const router = Router();
router.use(requireAuth);

router.post("/generate", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  try {
    const buffer = await generateImageBuffer(prompt.trim(), "1024x1024");
    res.json({ b64_json: buffer.toString("base64") });
  } catch (err: any) {
    res.status(500).json({ error: "Image generation failed" });
  }
});

export default router;
