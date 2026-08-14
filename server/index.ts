import "dotenv/config";
import { createApp } from "./app.js";
import { database } from "./db.js";

const port = Number(process.env.PORT ?? 8787);
const app = createApp(database);

const server = app.listen(port, "0.0.0.0", () => {
  const mode = process.env.OPENAI_API_KEY ? "API" : "Codex Skill";
  console.log(`迹点服务运行于 http://localhost:${port} · ${mode} 模式`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
