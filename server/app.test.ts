import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CandidateSubmission } from "../shared/contracts";
import { createApp } from "./app";
import { PlaceDatabase } from "./db";

describe("place trace API", () => {
  let database: PlaceDatabase;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    database = new PlaceDatabase(":memory:");
    app = createApp(database);
  });

  afterEach(() => {
    database.close();
  });

  it("keeps each user's map isolated", async () => {
    const first = await register("first@example.com", "甲");
    const second = await register("second@example.com", "乙");

    await request(app)
      .post("/api/demo")
      .set("Cookie", first.cookie)
      .expect(201);

    const firstState = await request(app)
      .get("/api/state")
      .set("Cookie", first.cookie)
      .expect(200);
    const secondState = await request(app)
      .get("/api/state")
      .set("Cookie", second.cookie)
      .expect(200);

    expect(firstState.body.queries).toHaveLength(1);
    expect(secondState.body.queries).toHaveLength(0);
  });

  it("does not create a place until the user adds a candidate", async () => {
    const session = await register("map@example.com", "地图用户");
    const demo = await request(app)
      .post("/api/demo")
      .set("Cookie", session.cookie)
      .expect(201);

    const before = await request(app)
      .get("/api/state")
      .set("Cookie", session.cookie)
      .expect(200);
    expect(before.body.places).toEqual([]);

    const candidate = demo.body.candidates[0];
    expect(candidate.confidence).toBe(98);

    const added = await request(app)
      .post(`/api/candidates/${candidate.id}/add`)
      .set("Cookie", session.cookie)
      .send({})
      .expect(201);

    expect(added.body.name).toBe(candidate.name);
    expect(added.body).not.toHaveProperty("confidence");
    expect(added.body.sourceCount).toBe(1);
  });

  it("requires confirmation before merging a likely duplicate", async () => {
    const session = await register("duplicate@example.com", "重复测试");
    const demo = await request(app)
      .post("/api/demo")
      .set("Cookie", session.cookie)
      .expect(201);
    const original = demo.body.candidates[0];
    const firstPlace = await request(app)
      .post(`/api/candidates/${original.id}/add`)
      .set("Cookie", session.cookie)
      .send({})
      .expect(201);

    const query = database.createQuery(
      session.userId,
      "再次提到中国美术学院南山校区。",
    );
    database.submitCandidates(
      query!.id,
      duplicateSubmission(original),
    );
    const duplicate = database.getQuery(query!.id, session.userId)!
      .candidates[0];

    const warning = await request(app)
      .post(`/api/candidates/${duplicate.id}/add`)
      .set("Cookie", session.cookie)
      .send({})
      .expect(409);
    expect(warning.body.duplicates[0].id).toBe(firstPlace.body.id);

    const merged = await request(app)
      .post(`/api/candidates/${duplicate.id}/add`)
      .set("Cookie", session.cookie)
      .send({ mergePlaceId: firstPlace.body.id })
      .expect(201);
    expect(merged.body.sourceCount).toBe(2);
  });

  it("prevents one user from adding another user's candidate", async () => {
    const owner = await register("owner@example.com", "拥有者");
    const stranger = await register("stranger@example.com", "其他人");
    const demo = await request(app)
      .post("/api/demo")
      .set("Cookie", owner.cookie)
      .expect(201);

    await request(app)
      .post(`/api/candidates/${demo.body.candidates[0].id}/add`)
      .set("Cookie", stranger.cookie)
      .send({})
      .expect(404);
  });

  async function register(email: string, name: string) {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ email, name, password: "password123" })
      .expect(201);
    return {
      cookie: response.headers["set-cookie"],
      userId: response.body.user.id as string,
    };
  }
});

function duplicateSubmission(
  candidate: Record<string, unknown>,
): CandidateSubmission {
  return {
    title: "重复地点",
    candidates: [
      {
        name: String(candidate.name),
        canonicalName: String(candidate.canonicalName),
        address: String(candidate.address),
        latitude: Number(candidate.latitude),
        longitude: Number(candidate.longitude),
        type: String(candidate.type),
        quote: "再次提到中国美术学院南山校区。",
        mentionConfidence: 99,
        matchConfidence: 98,
        note: "",
        thumbnailUrl: "",
      },
    ],
  };
}
