import { isIP } from "node:net";
import { candidateSubmissionSchema } from "../shared/contracts.js";
import type { QueryRecord } from "../shared/contracts.js";
import type { PlaceDatabase } from "./db.js";

const MAX_SOURCE_LENGTH = 60_000;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "candidates", "diagnostics"],
  properties: {
    title: { type: "string" },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "canonicalName",
          "address",
          "latitude",
          "longitude",
          "type",
          "quote",
          "mentionConfidence",
          "matchConfidence",
          "note",
          "thumbnailUrl",
        ],
        properties: {
          name: { type: "string" },
          canonicalName: { type: "string" },
          address: { type: "string" },
          latitude: { type: "number" },
          longitude: { type: "number" },
          type: { type: "string" },
          quote: { type: "string" },
          mentionConfidence: {
            type: "integer",
            minimum: 0,
            maximum: 100,
          },
          matchConfidence: {
            type: "integer",
            minimum: 0,
            maximum: 100,
          },
          note: { type: "string" },
          thumbnailUrl: { type: "string" },
        },
      },
    },
    diagnostics: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "model", "warnings"],
      properties: {
        summary: { type: "string" },
        model: { type: "string" },
        warnings: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

export function apiAgentEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function processWithApi(
  database: PlaceDatabase,
  query: QueryRecord,
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;

  database.markQueryStatus(query.id, "processing");
  try {
    const source =
      query.inputType === "url"
        ? await readPublicPage(query.input)
        : query.input;
    const model = process.env.OPENAI_MODEL ?? "gpt-5";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "你是地点候选整理 Agent。仅提取正文明确谈论、且位于中国大陆的可定位 POI。不要因为地点出现就创建收藏；只返回候选。地址和坐标必须尽力核验。提及置信度衡量正文是否在谈论该地点，匹配置信度衡量坐标实体是否正确。严重歧义必须在 note 中说明。quote 必须逐字来自输入。",
          },
          {
            role: "user",
            content: `输入类型：${query.inputType}\n来源：${query.input}\n\n正文：\n${source.slice(0, MAX_SOURCE_LENGTH)}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "place_candidates",
            strict: true,
            schema: responseSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      throw new Error(`OpenAI request failed (${response.status})`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const outputText = extractOutputText(payload);
    const parsed = candidateSubmissionSchema.parse(JSON.parse(outputText));
    database.submitCandidates(query.id, {
      ...parsed,
      sourceUrl: query.inputType === "url" ? query.input : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown agent error";
    database.markQueryStatus(query.id, "failed", { error: message });
  }
}

function extractOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray(
      (item as { content?: unknown[] }).content,
    )
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }
    }
  }
  throw new Error("Agent response did not contain structured output");
}

async function readPublicPage(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only public HTTP links are supported");
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error("Private network links are not supported");
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "PlaceTrace/1.0 (+personal place indexer)",
      Accept: "text/html,text/plain",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Unable to read source page (${response.status})`);
  }
  const html = (await response.text()).slice(0, MAX_SOURCE_LENGTH * 3);
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SOURCE_LENGTH);
}

function isPrivateHost(hostname: string) {
  const normalized = hostname.toLocaleLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  if (!isIP(normalized)) return false;
  return (
    normalized.startsWith("10.") ||
    normalized.startsWith("127.") ||
    normalized.startsWith("169.254.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}
