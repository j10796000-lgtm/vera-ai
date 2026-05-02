import { Router, type IRouter } from "express";
import healthRouter from "./health";
import anthropicRouter from "./anthropic/index";
import imageRouter from "./image/index";
import subscriptionRouter from "./subscription/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/anthropic", anthropicRouter);
router.use("/image", imageRouter);
router.use("/subscription", subscriptionRouter);

export default router;
