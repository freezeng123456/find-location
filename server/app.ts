import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import {
  authenticatedUserId,
  clearSession,
  createSession,
  hashPassword,
  verifyPassword,
} from "./auth.js";
import {
  agentModeForAccount,
  configuredAgentModes,
  processWithAgent,
} from "./agent.js";
import type { PlaceDatabase } from "./db.js";
import { proxyMapTile } from "./map-tiles.js";

const passwordSchema = z.string().min(8).max(200);

const loginSchema = z.object({
  email: z.string().trim().min(1).max(160),
  password: passwordSchema,
});

const registrationSchema = z.object({
  email: z.email().max(160),
  name: z.string().trim().min(1).max(60),
  password: passwordSchema,
});

const querySchema = z.object({
  input: z.string().trim().min(3).max(100_000),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(30),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#d96f45"),
});

const categoryPlacesSchema = z.object({
  placeIds: z.array(z.string().uuid()).max(1_000),
});

export function createApp(database: PlaceDatabase) {
  const app = express();
  const nvidiaRequests = new Map<string, number[]>();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production"
          ? {
              directives: {
                "default-src": ["'self'"],
                "script-src": ["'self'"],
                "style-src": [
                  "'self'",
                  "'unsafe-inline'",
                  "https://fonts.googleapis.com",
                ],
                "font-src": [
                  "'self'",
                  "data:",
                  "https://fonts.gstatic.com",
                ],
                "img-src": [
                  "'self'",
                  "data:",
                  "https://images.unsplash.com",
                  "https://*.tile.openstreetmap.org",
                ],
                "connect-src": ["'self'"],
              },
            }
          : false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/map-tiles/:z/:x/:tile", proxyMapTile);

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      agentModes: configuredAgentModes(),
    });
  });

  app.get("/api/session", (request, response) => {
    const userId = authenticatedUserId(request, database);
    const user = userId ? database.findUserById(userId) : undefined;
    response.json({
      authenticated: Boolean(user),
      agentMode: user
        ? agentModeForAccount(user.email)
        : "skill",
    });
  });

  app.post("/api/auth/register", (request, response) => {
    const body = registrationSchema.parse(request.body);
    if (database.findUserByEmail(body.email)) {
      return response
        .status(409)
        .json({ error: "这个邮箱已经注册，请直接登录。" });
    }
    const user = database.createUser({
      email: body.email,
      name: body.name,
      passwordHash: hashPassword(body.password),
    });
    createSession(response, database, user.id);
    return response.status(201).json({ user });
  });

  app.post("/api/auth/login", (request, response) => {
    const body = loginSchema.parse(request.body);
    const user = database.findUserByEmail(body.email);
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      return response.status(401).json({ error: "账号或密码不正确。" });
    }
    createSession(response, database, user.id);
    return response.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  });

  app.post("/api/auth/logout", (request, response) => {
    clearSession(request, response, database);
    response.status(204).end();
  });

  app.get("/api/state", (request, response) => {
    const userId = requireUser(request, response, database);
    if (!userId) return;
    response.json(database.getState(userId));
  });

  app.post("/api/queries", (request, response) => {
    const userId = requireUser(request, response, database);
    if (!userId) return;
    const { input } = querySchema.parse(request.body);
    const user = database.findUserById(userId);
    if (!user) return response.status(401).json({ error: "请先登录。" });
    const agentMode = agentModeForAccount(user.email);
    if (
      agentMode === "nvidia" &&
      !takeNvidiaTrialSlot(userId, nvidiaRequests)
    ) {
      response.setHeader("Retry-After", "60");
      return response.status(429).json({
        error: "免费 AI 试用请求过于频繁，请一分钟后再试。",
      });
    }
    const query = database.createQuery(userId, input);
    if (!query) throw new Error("Unable to create query");
    if (agentMode !== "skill") {
      void processWithAgent(database, query, agentMode);
    }
    return response.status(202).json({
      query,
      agentMode,
    });
  });

  app.post("/api/demo", (request, response) => {
    const userId = requireUser(request, response, database);
    if (!userId) return;
    response.status(201).json(database.seedDemo(userId));
  });

  app.post("/api/candidates/:id/add", (request, response) => {
    const userId = requireUser(request, response, database);
    if (!userId) return;
    const body = z
      .object({
        mergePlaceId: z.string().uuid().optional(),
        forceNew: z.boolean().optional(),
      })
      .parse(request.body ?? {});
    const result = database.addCandidate(userId, request.params.id, body);
    if (result && "duplicates" in result) {
      return response.status(409).json(result);
    }
    return response.status(201).json(result);
  });

  app.post("/api/places/:id/like", (request, response) => {
    const userId = requireUser(request, response, database);
    if (!userId) return;
    response.json(database.toggleLike(userId, request.params.id));
  });

  app.delete("/api/places/:id", (request, response) => {
    const userId = requireUser(request, response, database);
    if (!userId) return;
    database.softDeletePlace(userId, request.params.id);
    response.status(204).end();
  });

  app.post("/api/categories", (request, response) => {
    const userId = requireUser(request, response, database);
    if (!userId) return;
    const body = categorySchema.parse(request.body);
    response.status(201).json(
      database.createCategory(userId, body.name, body.color),
    );
  });

  app.put("/api/categories/:id/places", (request, response) => {
    const userId = requireUser(request, response, database);
    if (!userId) return;
    const { placeIds } = categoryPlacesSchema.parse(request.body);
    database.setCategoryPlaces(userId, request.params.id, placeIds);
    response.status(204).end();
  });

  app.post(
    "/api/places/:placeId/categories/:categoryId",
    (request, response) => {
      const userId = requireUser(request, response, database);
      if (!userId) return;
      response.json(
        database.togglePlaceCategory(
          userId,
          request.params.placeId,
          request.params.categoryId,
        ),
      );
    },
  );

  app.post("/api/rules/:id/decision", (request, response) => {
    const userId = requireUser(request, response, database);
    if (!userId) return;
    const { accept } = z
      .object({ accept: z.boolean() })
      .parse(request.body);
    database.decideRule(userId, request.params.id, accept);
    response.status(204).end();
  });

  if (process.env.NODE_ENV === "production") {
    const dist = resolve(process.cwd(), "dist");
    app.use(express.static(dist));
    app.use((request, response, next) => {
      if (request.path.startsWith("/api/")) return next();
      response.sendFile(resolve(dist, "index.html"));
    });
  }

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof ZodError) {
        return response.status(400).json({
          error: "提交的数据格式不正确。",
          issues: error.issues,
        });
      }
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      if (
        message.includes("not found") ||
        message.includes("not found".toLocaleUpperCase())
      ) {
        return response.status(404).json({ error: "没有找到对应记录。" });
      }
      if (message.includes("UNIQUE constraint failed")) {
        return response.status(409).json({ error: "名称已经存在。" });
      }
      console.error(error);
      return response.status(500).json({ error: "服务器暂时无法完成操作。" });
    },
  );

  return app;
}

function requireUser(
  request: Request,
  response: Response,
  database: PlaceDatabase,
) {
  const userId = authenticatedUserId(request, database);
  if (!userId) {
    response.status(401).json({ error: "请先登录。" });
    return null;
  }
  return userId;
}

function takeNvidiaTrialSlot(
  userId: string,
  requests: Map<string, number[]>,
) {
  const configuredLimit = Number(process.env.NVIDIA_TRIAL_RPM ?? 8);
  const limit =
    Number.isInteger(configuredLimit) &&
    configuredLimit > 0 &&
    configuredLimit <= 40
      ? configuredLimit
      : 8;
  const cutoff = Date.now() - 60_000;
  const recent = (requests.get(userId) ?? []).filter(
    (timestamp) => timestamp > cutoff,
  );
  if (recent.length >= limit) {
    requests.set(userId, recent);
    return false;
  }
  recent.push(Date.now());
  requests.set(userId, recent);
  return true;
}
