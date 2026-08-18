import { isIP } from "node:net";
import { candidateSubmissionSchema } from "../shared/contracts.js";
import type {
  AgentMode,
  CandidateSubmission,
  QueryRecord,
} from "../shared/contracts.js";
import type { PlaceDatabase } from "./db.js";

const MAX_SOURCE_LENGTH = 60_000;
const AGENT_INSTRUCTIONS =
  "你是地点候选整理 Agent。仅提取正文明确谈论、且位于中国大陆的可定位 POI。不要因为地点出现就创建收藏；只返回候选。地址和坐标必须尽力核验。提及置信度衡量正文是否在谈论该地点，匹配置信度衡量坐标实体是否正确。严重歧义必须在 note 中说明。quote 必须逐字来自输入。thumbnailUrl 没有可靠的公开图片时必须返回空字符串。";

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

export function agentModeForAccount(account: string): AgentMode {
  if (
    process.env.NVIDIA_API_KEY &&
    nvidiaAccountAllowed(account)
  ) {
    return "nvidia";
  }
  if (process.env.OPENAI_API_KEY) return "openai";
  return "skill";
}

export function configuredAgentModes() {
  return {
    skill: true,
    openai: Boolean(process.env.OPENAI_API_KEY),
    nvidia: Boolean(process.env.NVIDIA_API_KEY),
  };
}

export async function processWithAgent(
  database: PlaceDatabase,
  query: QueryRecord,
  mode: Exclude<AgentMode, "skill">,
) {
  database.markQueryStatus(query.id, "processing");
  try {
    const source =
      query.inputType === "url"
        ? await readPublicPage(query.input)
        : query.input;
    const submission =
      mode === "nvidia"
        ? await processWithNvidia(query, source)
        : await processWithOpenAI(query, source);
    database.submitCandidates(query.id, {
      ...submission,
      sourceUrl: query.inputType === "url" ? query.input : undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown agent error";
    database.markQueryStatus(query.id, "failed", {
      provider: mode,
      error: message,
    });
  }
}

async function processWithOpenAI(
  query: QueryRecord,
  source: string,
): Promise<CandidateSubmission> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured");

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
          content: AGENT_INSTRUCTIONS,
        },
        {
          role: "user",
          content: sourcePrompt(query, source),
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
  return candidateSubmissionSchema.parse(
    JSON.parse(extractOutputText(payload)),
  );
}

async function processWithNvidia(
  query: QueryRecord,
  source: string,
): Promise<CandidateSubmission> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA NIM is not configured");
  const model =
    process.env.NVIDIA_MODEL ?? "meta/llama-3.1-70b-instruct";
  const endpoint =
    process.env.NVIDIA_BASE_URL ??
    "https://integrate.api.nvidia.com/v1";
  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `${AGENT_INSTRUCTIONS}

只返回一个合法 JSON 对象，不要使用 Markdown 代码块或解释文字。格式必须是：
{"title":"查询标题","candidates":[{"name":"显示名称","canonicalName":"地图标准名称","address":"完整地址","latitude":30.0,"longitude":120.0,"type":"地点类型","quote":"原文逐字引用","mentionConfidence":90,"matchConfidence":90,"note":"简短说明","thumbnailUrl":""}],"diagnostics":{"summary":"处理摘要","model":"${model}","warnings":[]}}`,
        },
        {
          role: "user",
          content: sourcePrompt(query, source),
        },
      ],
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 4_096,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`NVIDIA NIM request failed (${response.status})`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const content = extractNvidiaOutput(payload);
  const parsed = candidateSubmissionSchema.parse(
    parseJsonObject(content),
  );
  return {
    ...parsed,
    diagnostics: {
      ...parsed.diagnostics,
      model,
    },
  };
}

function sourcePrompt(query: QueryRecord, source: string) {
  return `输入类型：${query.inputType}
来源：${query.input}

正文：
${source.slice(0, MAX_SOURCE_LENGTH)}`;
}

function nvidiaAccountAllowed(account: string) {
  const allowed = (process.env.NVIDIA_ALLOWED_ACCOUNTS ?? "")
    .split(",")
    .map((value) => value.trim().toLocaleLowerCase())
    .filter(Boolean);
  const normalized = account.trim().toLocaleLowerCase();
  return allowed.includes("*") || allowed.includes(normalized);
}

function extractNvidiaOutput(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") {
    throw new Error("NVIDIA NIM response did not contain a choice");
  }
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    throw new Error("NVIDIA NIM response did not contain a message");
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string") {
    throw new Error("NVIDIA NIM response did not contain text");
  }
  return content;
}

function parseJsonObject(content: string) {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Agent response did not contain JSON");
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

/*
 * OpenAI Responses returns text in a different envelope from the
 * OpenAI-compatible Chat Completions endpoint used by NVIDIA NIM.
 */
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
