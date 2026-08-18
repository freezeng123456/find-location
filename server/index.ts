import "dotenv/config";
import { createApp } from "./app.js";
import { configuredAgentModes } from "./agent.js";
import { hashPassword } from "./auth.js";
import { database } from "./db.js";

const port = Number(process.env.PORT ?? 8787);
initializeTrialAccount();
const app = createApp(database);

const server = app.listen(port, "0.0.0.0", () => {
  const modes = configuredAgentModes();
  const mode = modes.nvidia
    ? "NVIDIA NIM"
    : modes.openai
      ? "OpenAI"
      : "Codex Skill";
  console.log(`迹点服务运行于 http://localhost:${port} · ${mode} 模式`);
});

function initializeTrialAccount() {
  const account = process.env.TRIAL_ACCOUNT_LOGIN?.trim();
  const password = process.env.TRIAL_ACCOUNT_PASSWORD;
  if (!account || !password) return;
  if (password.length < 8) {
    throw new Error("TRIAL_ACCOUNT_PASSWORD must be at least 8 characters");
  }
  if (!database.findUserByEmail(account)) {
    database.createUser({
      email: account,
      name: "免费试用",
      passwordHash: hashPassword(password),
    });
    console.log(`已初始化试用账号：${account}`);
  }
}

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
