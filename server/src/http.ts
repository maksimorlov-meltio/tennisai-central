import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { verifyToken, bearerFrom } from "./auth/jwt";
import { env } from "./env";

/** Augment Express' Request with the authenticated user id. */
export interface AuthedRequest extends Request {
  userId?: string;
}

/** Success envelope — matches the frontend ApiResponse<T> contract. */
export function ok<T>(res: Response, data: T, message?: string, status = 200) {
  return res.status(status).json(message ? { data, message } : { data });
}

/** A domain error the route can throw to produce a specific status + message. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Wrap an async handler so a rejected promise flows to the error middleware
 * instead of hanging the request / crashing the process (Express 4).
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** Require a valid Bearer token; sets req.userId. */
export const requireAuth: RequestHandler = (req: AuthedRequest, res, next) => {
  const userId = verifyToken(bearerFrom(req.headers.authorization));
  if (!userId) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  req.userId = userId;
  next();
};

/** Terminal error handler — always emits a parseable `{ message }` body. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ message: "Invalid request data", issues: err.flatten() });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ message: "That record already exists" });
    if (err.code === "P2025") return res.status(404).json({ message: "Not found" });
  }

  // Unexpected — log the real error server-side, never leak internals to the client.
  // Raw detail is exposed ONLY in local development; test and production get a
  // generic message so stack/DB internals never reach a real client.
  console.error("[error]", err);
  const message = env.nodeEnv === "development" ? String(err) : "Internal server error";
  return res.status(500).json({ message });
}
