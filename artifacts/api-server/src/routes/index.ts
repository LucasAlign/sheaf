import { Router, type IRouter } from "express";
import bridgeRouter from "./bridge";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bridgeRouter);

export default router;
