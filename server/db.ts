import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AppState,
  Candidate,
  CandidateSubmission,
  Category,
  DuplicatePlace,
  Place,
  QueryRecord,
  Rule,
  User,
} from "../shared/contracts.js";

const DEFAULT_DATABASE_PATH = resolve(process.cwd(), "data", "places.db");

function now() {
  return new Date().toISOString();
}

function asBoolean(value: number) {
  return value === 1;
}

function normalizeName(value: string) {
  return value
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•,，.。'"""“”‘’()（）\-—_]/g, "")
    .replace(/(景区|风景区|公园|博物馆|美术馆)$/u, "");
}

function distanceInMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(a));
}

export class PlaceDatabase {
  readonly raw: Database.Database;

  constructor(filename = process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH) {
    if (filename !== ":memory:") {
      mkdirSync(dirname(filename), { recursive: true });
    }

    this.raw = new Database(filename);
    this.raw.pragma("journal_mode = WAL");
    this.raw.pragma("foreign_keys = ON");
    this.migrate();
  }

  close() {
    this.raw.close();
  }

  private migrate() {
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        input_type TEXT NOT NULL CHECK(input_type IN ('url', 'text')),
        input TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '等待 Agent 分析',
        source_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'ready', 'failed')),
        diagnostics_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        query_id TEXT NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        address TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        type TEXT NOT NULL,
        quote TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        mention_confidence INTEGER NOT NULL,
        match_confidence INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT NOT NULL DEFAULT '',
        added_place_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS places (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        type TEXT NOT NULL,
        thumbnail_url TEXT NOT NULL DEFAULT '',
        liked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS place_sources (
        id TEXT PRIMARY KEY,
        place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
        query_id TEXT NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
        candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
        quote TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(place_id, candidate_id)
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_id, name)
      );

      CREATE TABLE IF NOT EXISTS place_categories (
        place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY(place_id, category_id)
      );

      CREATE TABLE IF NOT EXISTS place_events (
        id TEXT PRIMARY KEY,
        place_id TEXT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        scope TEXT NOT NULL CHECK(scope IN ('system', 'user', 'task', 'correction')),
        content TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'proposed', 'rejected')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS queries_user_created
        ON queries(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS places_user_active
        ON places(user_id, deleted_at);
      CREATE INDEX IF NOT EXISTS candidates_query
        ON candidates(query_id);
    `);

    const systemRuleCount = this.raw
      .prepare(
        "SELECT COUNT(*) AS count FROM rules WHERE scope = 'system' AND user_id IS NULL",
      )
      .get() as { count: number };

    if (systemRuleCount.count === 0) {
      const stamp = now();
      const insert = this.raw.prepare(`
        INSERT INTO rules (id, user_id, scope, content, status, created_at, updated_at)
        VALUES (?, NULL, 'system', ?, 'active', ?, ?)
      `);
      insert.run(
        randomUUID(),
        "只生成候选地点；必须由用户点击“加入”后才能创建正式地点。",
        stamp,
        stamp,
      );
      insert.run(
        randomUUID(),
        "语义判断可以由 Agent 完成，但坐标、数据归属和写入结构必须通过确定性校验。",
        stamp,
        stamp,
      );
    }
  }

  createUser(input: {
    email: string;
    name: string;
    passwordHash: string;
  }): User {
    const user: User = {
      id: randomUUID(),
      email: input.email.toLocaleLowerCase(),
      name: input.name,
    };
    this.raw
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(user.id, user.email, user.name, input.passwordHash, now());
    return user;
  }

  findUserByEmail(email: string) {
    return this.raw
      .prepare(
        "SELECT id, email, name, password_hash FROM users WHERE email = ?",
      )
      .get(email.toLocaleLowerCase()) as
      | (User & { password_hash: string })
      | undefined;
  }

  findUserById(id: string): User | undefined {
    return this.raw
      .prepare("SELECT id, email, name FROM users WHERE id = ?")
      .get(id) as User | undefined;
  }

  createSession(userId: string, tokenHash: string, expiresAt: string) {
    this.raw
      .prepare(
        `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(tokenHash, userId, expiresAt, now());
  }

  findSession(tokenHash: string) {
    return this.raw
      .prepare(
        `SELECT user_id, expires_at FROM sessions
         WHERE token_hash = ? AND expires_at > ?`,
      )
      .get(tokenHash, now()) as
      | { user_id: string; expires_at: string }
      | undefined;
  }

  deleteSession(tokenHash: string) {
    this.raw
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .run(tokenHash);
  }

  createQuery(userId: string, input: string) {
    const inputType = /^https?:\/\//i.test(input.trim()) ? "url" : "text";
    const id = randomUUID();
    this.raw
      .prepare(
        `INSERT INTO queries
          (id, user_id, input_type, input, source_url, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        id,
        userId,
        inputType,
        input.trim(),
        inputType === "url" ? input.trim() : "",
        now(),
      );
    return this.getQuery(id, userId);
  }

  getQuery(id: string, userId?: string): QueryRecord | undefined {
    const row = this.raw
      .prepare(
        `SELECT * FROM queries
         WHERE id = ? ${userId ? "AND user_id = ?" : ""}`,
      )
      .get(...(userId ? [id, userId] : [id])) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return this.serializeQuery(row);
  }

  listPendingQueries() {
    return this.raw
      .prepare(
        `SELECT q.*, u.email AS user_email
         FROM queries q
         JOIN users u ON u.id = q.user_id
         WHERE q.status = 'pending'
         ORDER BY q.created_at ASC`,
      )
      .all() as Array<Record<string, unknown>>;
  }

  getAgentContext(queryId: string) {
    const owner = this.raw
      .prepare(
        `SELECT q.user_id, u.email
         FROM queries q
         JOIN users u ON u.id = q.user_id
         WHERE q.id = ?`,
      )
      .get(queryId) as { user_id: string; email: string } | undefined;
    if (!owner) throw new Error("Query not found");
    const query = this.getQuery(queryId, owner.user_id);
    const rules = this.raw
      .prepare(
        `SELECT * FROM rules
         WHERE status = 'active' AND (user_id IS NULL OR user_id = ?)
         ORDER BY CASE scope
           WHEN 'system' THEN 0
           WHEN 'user' THEN 1
           WHEN 'task' THEN 2
           ELSE 3
         END, created_at`,
      )
      .all(owner.user_id)
      .map((row) => this.serializeRule(row as Record<string, unknown>));
    return { userEmail: owner.email, query, rules };
  }

  markQueryStatus(
    queryId: string,
    status: QueryRecord["status"],
    diagnostics: Record<string, unknown> = {},
  ) {
    const result = this.raw
      .prepare(
        `UPDATE queries
         SET status = ?, diagnostics_json = ?,
             completed_at = CASE WHEN ? IN ('ready', 'failed') THEN ? ELSE completed_at END
         WHERE id = ?`,
      )
      .run(
        status,
        JSON.stringify(diagnostics),
        status,
        now(),
        queryId,
      );
    if (result.changes === 0) throw new Error("Query not found");
  }

  submitCandidates(queryId: string, submission: CandidateSubmission) {
    const query = this.raw
      .prepare("SELECT id, input_type FROM queries WHERE id = ?")
      .get(queryId) as { id: string; input_type: string } | undefined;
    if (!query) throw new Error("Query not found");

    const save = this.raw.transaction(() => {
      this.raw
        .prepare(
          `UPDATE queries
           SET title = ?, source_url = CASE WHEN ? != '' THEN ? ELSE source_url END,
               status = 'ready', diagnostics_json = ?, completed_at = ?
           WHERE id = ?`,
        )
        .run(
          submission.title,
          submission.sourceUrl ?? "",
          submission.sourceUrl ?? "",
          JSON.stringify(submission.diagnostics ?? {}),
          now(),
          queryId,
        );
      this.raw
        .prepare("DELETE FROM candidates WHERE query_id = ?")
        .run(queryId);

      const insert = this.raw.prepare(`
        INSERT INTO candidates (
          id, query_id, name, canonical_name, address, latitude, longitude,
          type, quote, confidence, mention_confidence, match_confidence, note,
          thumbnail_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const candidate of submission.candidates) {
        const confidence = Math.round(
          Math.sqrt(
            candidate.mentionConfidence * candidate.matchConfidence,
          ),
        );
        insert.run(
          randomUUID(),
          queryId,
          candidate.name,
          candidate.canonicalName ?? candidate.name,
          candidate.address,
          candidate.latitude,
          candidate.longitude,
          candidate.type,
          candidate.quote,
          confidence,
          candidate.mentionConfidence,
          candidate.matchConfidence,
          candidate.note,
          candidate.thumbnailUrl,
          now(),
        );
      }
    });
    save();
  }

  seedDemo(userId: string) {
    const existing = this.raw
      .prepare(
        `SELECT id FROM queries
         WHERE user_id = ? AND title = '杭州南山路的一天'
         LIMIT 1`,
      )
      .get(userId) as { id: string } | undefined;
    if (existing) return this.getQuery(existing.id, userId);

    const query = this.createQuery(
      userId,
      "周六想沿着杭州南山路走走。早上从中国美术学院南山校区出发，去柳浪闻莺看西湖边的新绿；午后到浙江美术馆看展。如果还有时间，再去太子湾公园，但周末可能会比较拥挤。",
    );
    if (!query) throw new Error("Unable to create demo query");

    this.submitCandidates(query.id, {
      title: "杭州南山路的一天",
      candidates: [
        {
          name: "中国美术学院南山校区",
          address: "浙江省杭州市上城区南山路218号",
          latitude: 30.24361,
          longitude: 120.16194,
          type: "校园",
          quote: "早上从中国美术学院南山校区出发",
          mentionConfidence: 99,
          matchConfidence: 98,
          note: "名称与完整校区匹配，位置明确。",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1564981797816-1043664bf78d?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "柳浪闻莺",
          address: "浙江省杭州市上城区南山路87号",
          latitude: 30.23754,
          longitude: 120.15577,
          type: "公园",
          quote: "去柳浪闻莺看西湖边的新绿",
          mentionConfidence: 99,
          matchConfidence: 96,
          note: "杭州语境明确，对应西湖十景之一。",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1591123120675-6f7f1aae0e5b?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "浙江美术馆",
          address: "浙江省杭州市上城区南山路138号",
          latitude: 30.23293,
          longitude: 120.15991,
          type: "美术馆",
          quote: "午后到浙江美术馆看展",
          mentionConfidence: 99,
          matchConfidence: 98,
          note: "机构名称和南山路上下文均一致。",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1561214115-f2f134cc4912?auto=format&fit=crop&w=900&q=80",
        },
        {
          name: "太子湾公园",
          address: "浙江省杭州市西湖区南山路5-1号",
          latitude: 30.2224,
          longitude: 120.13944,
          type: "公园",
          quote: "如果还有时间，再去太子湾公园",
          mentionConfidence: 97,
          matchConfidence: 95,
          note: "文章将其作为可选行程，仍是明确提及的地点。",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
        },
      ],
      diagnostics: {
        model: "codex-skill-demo",
        summary: "从行程描述中识别出四个明确且可定位的地点。",
      },
    });
    return this.getQuery(query.id, userId);
  }

  findDuplicates(
    userId: string,
    candidateId: string,
  ): DuplicatePlace[] {
    const candidate = this.raw
      .prepare(
        `SELECT c.* FROM candidates c
         JOIN queries q ON q.id = c.query_id
         WHERE c.id = ? AND q.user_id = ?`,
      )
      .get(candidateId, userId) as Record<string, unknown> | undefined;
    if (!candidate) throw new Error("Candidate not found");

    const places = this.raw
      .prepare(
        "SELECT * FROM places WHERE user_id = ? AND deleted_at IS NULL",
      )
      .all(userId) as Array<Record<string, unknown>>;

    return places
      .map((place) => ({
        id: String(place.id),
        name: String(place.name),
        address: String(place.address),
        distanceMeters: Math.round(
          distanceInMeters(
            Number(candidate.latitude),
            Number(candidate.longitude),
            Number(place.latitude),
            Number(place.longitude),
          ),
        ),
        sameName:
          normalizeName(String(place.name)) ===
          normalizeName(String(candidate.canonical_name)),
      }))
      .filter((place) => place.sameName || place.distanceMeters <= 120)
      .map(({ sameName: _sameName, ...place }) => place)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  addCandidate(
    userId: string,
    candidateId: string,
    options: { mergePlaceId?: string; forceNew?: boolean } = {},
  ) {
    const row = this.raw
      .prepare(
        `SELECT c.*, q.user_id FROM candidates c
         JOIN queries q ON q.id = c.query_id
         WHERE c.id = ? AND q.user_id = ?`,
      )
      .get(candidateId, userId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Candidate not found");

    if (row.added_place_id) {
      return this.getPlace(String(row.added_place_id), userId);
    }

    if (!options.mergePlaceId && !options.forceNew) {
      const duplicates = this.findDuplicates(userId, candidateId);
      if (duplicates.length > 0) {
        return { duplicates };
      }
    }

    const add = this.raw.transaction(() => {
      let placeId = options.mergePlaceId;
      if (placeId) {
        const target = this.raw
          .prepare(
            `SELECT id FROM places
             WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
          )
          .get(placeId, userId);
        if (!target) throw new Error("Merge target not found");
      } else {
        placeId = randomUUID();
        const stamp = now();
        this.raw
          .prepare(
            `INSERT INTO places (
              id, user_id, name, address, latitude, longitude, type,
              thumbnail_url, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            placeId,
            userId,
            row.name,
            row.address,
            row.latitude,
            row.longitude,
            row.type,
            row.thumbnail_url,
            stamp,
            stamp,
          );
      }

      this.raw
        .prepare(
          `INSERT OR IGNORE INTO place_sources
            (id, place_id, query_id, candidate_id, quote, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          placeId,
          row.query_id,
          candidateId,
          row.quote,
          now(),
        );
      this.raw
        .prepare(
          "UPDATE candidates SET added_place_id = ? WHERE id = ?",
        )
        .run(placeId, candidateId);
      this.recordEvent(
        placeId,
        userId,
        options.mergePlaceId ? "source_merged" : "place_created",
        { candidateId, queryId: row.query_id },
      );
      return this.getPlace(placeId, userId);
    });

    return add();
  }

  getPlace(id: string, userId: string): Place | undefined {
    const row = this.raw
      .prepare(
        `SELECT p.*,
          (SELECT COUNT(*) FROM place_sources ps WHERE ps.place_id = p.id) AS source_count
         FROM places p
         WHERE p.id = ? AND p.user_id = ? AND p.deleted_at IS NULL`,
      )
      .get(id, userId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.serializePlace(row, this.categoriesForPlace(id));
  }

  toggleLike(userId: string, placeId: string) {
    const place = this.getPlace(placeId, userId);
    if (!place) throw new Error("Place not found");
    const liked = !place.liked;
    this.raw
      .prepare(
        "UPDATE places SET liked = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .run(liked ? 1 : 0, now(), placeId, userId);
    this.recordEvent(placeId, userId, liked ? "liked" : "unliked");
    return this.getPlace(placeId, userId);
  }

  softDeletePlace(userId: string, placeId: string) {
    const result = this.raw
      .prepare(
        `UPDATE places SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      )
      .run(now(), now(), placeId, userId);
    if (result.changes === 0) throw new Error("Place not found");
    this.recordEvent(placeId, userId, "deleted");
  }

  createCategory(userId: string, name: string, color: string): Category {
    const id = randomUUID();
    this.raw
      .prepare(
        `INSERT INTO categories (id, user_id, name, color, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, userId, name, color, now());
    return { id, name, color, placeCount: 0 };
  }

  togglePlaceCategory(
    userId: string,
    placeId: string,
    categoryId: string,
  ) {
    const ownership = this.raw
      .prepare(
        `SELECT p.id
         FROM places p, categories c
         WHERE p.id = ? AND c.id = ?
           AND p.user_id = ? AND c.user_id = ?`,
      )
      .get(placeId, categoryId, userId, userId);
    if (!ownership) throw new Error("Place or category not found");

    const existing = this.raw
      .prepare(
        `SELECT 1 FROM place_categories
         WHERE place_id = ? AND category_id = ?`,
      )
      .get(placeId, categoryId);
    if (existing) {
      this.raw
        .prepare(
          `DELETE FROM place_categories
           WHERE place_id = ? AND category_id = ?`,
        )
        .run(placeId, categoryId);
    } else {
      this.raw
        .prepare(
          `INSERT INTO place_categories (place_id, category_id)
           VALUES (?, ?)`,
        )
        .run(placeId, categoryId);
    }
    this.recordEvent(placeId, userId, "categories_changed", {
      categoryId,
      attached: !existing,
    });
    return this.getPlace(placeId, userId);
  }

  proposeRule(userId: string, scope: Rule["scope"], content: string) {
    const id = randomUUID();
    const stamp = now();
    this.raw
      .prepare(
        `INSERT INTO rules
          (id, user_id, scope, content, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'proposed', ?, ?)`,
      )
      .run(id, userId, scope, content, stamp, stamp);
    return id;
  }

  decideRule(userId: string, id: string, accept: boolean) {
    const result = this.raw
      .prepare(
        `UPDATE rules SET status = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'proposed'`,
      )
      .run(accept ? "active" : "rejected", now(), id, userId);
    if (result.changes === 0) throw new Error("Rule proposal not found");
  }

  getState(userId: string): AppState {
    const user = this.findUserById(userId);
    if (!user) throw new Error("User not found");

    const categories = this.raw
      .prepare(
        `SELECT c.*,
          (SELECT COUNT(*) FROM place_categories pc
           JOIN places p ON p.id = pc.place_id
           WHERE pc.category_id = c.id AND p.deleted_at IS NULL) AS place_count
         FROM categories c WHERE c.user_id = ? ORDER BY c.created_at`,
      )
      .all(userId)
      .map((row) => this.serializeCategory(row as Record<string, unknown>));

    const placeRows = this.raw
      .prepare(
        `SELECT p.*,
          (SELECT COUNT(*) FROM place_sources ps WHERE ps.place_id = p.id) AS source_count
         FROM places p
         WHERE p.user_id = ? AND p.deleted_at IS NULL
         ORDER BY p.created_at DESC`,
      )
      .all(userId) as Array<Record<string, unknown>>;
    const places = placeRows.map((row) =>
      this.serializePlace(row, this.categoriesForPlace(String(row.id))),
    );

    const queryRows = this.raw
      .prepare(
        `SELECT * FROM queries
         WHERE user_id = ?
         ORDER BY created_at DESC`,
      )
      .all(userId) as Array<Record<string, unknown>>;
    const queries = queryRows.map((row) => this.serializeQuery(row));

    const rules = this.raw
      .prepare(
        `SELECT * FROM rules
         WHERE user_id IS NULL OR user_id = ?
         ORDER BY CASE status WHEN 'proposed' THEN 0 ELSE 1 END, created_at`,
      )
      .all(userId)
      .map((row) => this.serializeRule(row as Record<string, unknown>));

    return { user, categories, places, queries, rules };
  }

  private recordEvent(
    placeId: string,
    userId: string,
    eventType: string,
    payload: Record<string, unknown> = {},
  ) {
    this.raw
      .prepare(
        `INSERT INTO place_events
          (id, place_id, user_id, event_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        placeId,
        userId,
        eventType,
        JSON.stringify(payload),
        now(),
      );
  }

  private categoriesForPlace(placeId: string): Category[] {
    return this.raw
      .prepare(
        `SELECT c.*,
          (SELECT COUNT(*) FROM place_categories pc2
           JOIN places p2 ON p2.id = pc2.place_id
           WHERE pc2.category_id = c.id AND p2.deleted_at IS NULL) AS place_count
         FROM categories c
         JOIN place_categories pc ON pc.category_id = c.id
         WHERE pc.place_id = ?
         ORDER BY c.created_at`,
      )
      .all(placeId)
      .map((row) => this.serializeCategory(row as Record<string, unknown>));
  }

  private serializeCategory(row: Record<string, unknown>): Category {
    return {
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
      placeCount: Number(row.place_count ?? 0),
    };
  }

  private serializePlace(
    row: Record<string, unknown>,
    categories: Category[],
  ): Place {
    return {
      id: String(row.id),
      name: String(row.name),
      address: String(row.address),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      type: String(row.type),
      thumbnailUrl: String(row.thumbnail_url),
      liked: asBoolean(Number(row.liked)),
      createdAt: String(row.created_at),
      sourceCount: Number(row.source_count ?? 0),
      categories,
    };
  }

  private serializeCandidate(row: Record<string, unknown>): Candidate {
    return {
      id: String(row.id),
      queryId: String(row.query_id),
      name: String(row.name),
      canonicalName: String(row.canonical_name),
      address: String(row.address),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      type: String(row.type),
      quote: String(row.quote),
      confidence: Number(row.confidence),
      mentionConfidence: Number(row.mention_confidence),
      matchConfidence: Number(row.match_confidence),
      note: String(row.note),
      thumbnailUrl: String(row.thumbnail_url),
      addedPlaceId: row.added_place_id
        ? String(row.added_place_id)
        : null,
    };
  }

  private serializeQuery(row: Record<string, unknown>): QueryRecord {
    const candidates = this.raw
      .prepare(
        "SELECT * FROM candidates WHERE query_id = ? ORDER BY confidence DESC",
      )
      .all(String(row.id))
      .map((candidate) =>
        this.serializeCandidate(candidate as Record<string, unknown>),
      );
    return {
      id: String(row.id),
      inputType: row.input_type as QueryRecord["inputType"],
      input: String(row.input),
      title: String(row.title),
      sourceUrl: String(row.source_url),
      status: row.status as QueryRecord["status"],
      createdAt: String(row.created_at),
      completedAt: row.completed_at ? String(row.completed_at) : null,
      candidates,
    };
  }

  private serializeRule(row: Record<string, unknown>): Rule {
    return {
      id: String(row.id),
      scope: row.scope as Rule["scope"],
      content: String(row.content),
      status: row.status as Rule["status"],
      createdAt: String(row.created_at),
    };
  }
}

export const database = new PlaceDatabase();
