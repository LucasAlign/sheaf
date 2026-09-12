import { Router, type IRouter, type Request as ExpressRequest, type Response as ExpressResponse } from "express";
import portal from "../bridge/api/portal";
import cron from "../bridge/api/cron";
import type { Request as BridgeRequest, Response as BridgeResponse } from "../bridge/server/http";

const router: IRouter = Router();

function bridgeRequest(req: ExpressRequest) {
  const request = req as unknown as BridgeRequest;
  request.query = req.query as BridgeRequest["query"];
  request.body = req.body;
  return request;
}

function bridgeResponse(res: ExpressResponse) {
  return res as unknown as BridgeResponse;
}

router.all("/portal", async (req, res, next) => {
  try {
    await portal(bridgeRequest(req), bridgeResponse(res));
  } catch (error) {
    next(error);
  }
});

router.all("/cron", async (req, res, next) => {
  try {
    await cron(bridgeRequest(req), bridgeResponse(res));
  } catch (error) {
    next(error);
  }
});

export default router;