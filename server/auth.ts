import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response } from "express";
import type { PlaceDatabase } from "./db.js";

const COOKIE_NAME = "place_trace_session";
const SESSION_DAYS = 30;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

export function createSession(
  response: Response,
  database: PlaceDatabase,
  userId: string,
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  );
  database.createSession(userId, tokenHash(token), expiresAt.toISOString());
  response.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      response.req.secure || process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSession(
  request: Request,
  response: Response,
  database: PlaceDatabase,
) {
  const token = readCookie(request, COOKIE_NAME);
  if (token) database.deleteSession(tokenHash(token));
  response.clearCookie(COOKIE_NAME, { path: "/" });
}

export function authenticatedUserId(
  request: Request,
  database: PlaceDatabase,
) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return null;
  const session = database.findSession(tokenHash(token));
  return session?.user_id ?? null;
}

function readCookie(request: Request, name: string) {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}
