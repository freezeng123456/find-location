#!/usr/bin/env node
import "dotenv/config";
import { readFileSync } from "node:fs";
import { candidateSubmissionSchema } from "../shared/contracts.js";
import { database } from "../server/db.js";
import { hashPassword } from "../server/auth.js";

const [command = "help", ...args] = process.argv.slice(2);

try {
  switch (command) {
    case "pending": {
      const pending = database.listPendingQueries().map((row) => ({
        id: row.id,
        userEmail: row.user_email,
        inputType: row.input_type,
        input: row.input,
        createdAt: row.created_at,
      }));
      print({ pending });
      break;
    }
    case "show": {
      const id = required(args[0], "query id");
      print(database.getAgentContext(id));
      break;
    }
    case "submit": {
      const id = required(args[0], "query id");
      const path = required(args[1], "candidate JSON path");
      const payload = candidateSubmissionSchema.parse(
        JSON.parse(readFileSync(path, "utf8")),
      );
      database.submitCandidates(id, payload);
      print({ ok: true, query: database.getQuery(id) });
      break;
    }
    case "propose-rule": {
      const email = required(args[0], "user email");
      const content = required(args.slice(1).join(" "), "rule content");
      const user = database.findUserByEmail(email);
      if (!user) fail("User not found");
      const id = database.proposeRule(user.id, "user", content);
      print({ ok: true, id, status: "proposed" });
      break;
    }
    case "seed": {
      const email = "demo@placed.local";
      let user = database.findUserByEmail(email);
      if (!user) {
        database.createUser({
          email,
          name: "地图漫游者",
          passwordHash: hashPassword("demo12345"),
        });
        user = database.findUserByEmail(email);
      }
      if (!user) fail("Unable to create demo account");
      database.seedDemo(user.id);
      print({
        ok: true,
        email,
        password: "demo12345",
        note: "仅用于本地体验，请勿在公开环境使用此密码。",
      });
      break;
    }
    default:
      process.stdout.write(`迹点 Skill CLI

用法：
  npm run places -- pending
  npm run places -- show <query-id>
  npm run places -- submit <query-id> <candidates.json>
  npm run places -- propose-rule <user-email> "<规则>"
  npm run seed
`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  database.close();
}

function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function required(value: string | undefined, label: string) {
  if (!value) fail(`Missing ${label}`);
  return value;
}

function fail(message: string): never {
  throw new Error(message);
}
