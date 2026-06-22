import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const OPENROUTER_MODEL_ALIASES = {
  "anthropic/claude-3.5-sonnet": "anthropic/claude-sonnet-4",
  "anthropic/claude-3.5-sonnet:beta": "anthropic/claude-sonnet-4",
  "anthropic/claude-3-sonnet": "anthropic/claude-sonnet-4",
  "anthropic/claude-3-sonnet-20240229": "anthropic/claude-sonnet-4",
  "anthropic/claude-3-opus": "anthropic/claude-opus-4",
  "anthropic/claude-3-opus-20240229": "anthropic/claude-opus-4",
  "claude-3.5-sonnet": "anthropic/claude-sonnet-4",
  "claude-3-opus": "anthropic/claude-opus-4",
  "claude-3-sonnet": "anthropic/claude-sonnet-4"
};

export const OPENROUTER_RECOMMENDED_MODELS = [
  "openai/gpt-4.1-mini",
  "openai/gpt-4o-mini",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-sonnet-4.6",
  "~anthropic/claude-sonnet-latest",
  "google/gemini-2.5-pro-preview",
  "deepseek/deepseek-chat"
];

function normalizeModelId(model) {
  const raw = String(model || "").trim();
  if (!raw) return "";
  if (raw.startsWith("anthropic/") || raw.startsWith("openai/") || raw.startsWith("google/") || raw.startsWith("~")) {
    return raw;
  }
  if (raw.startsWith("claude")) return `anthropic/${raw}`;
  return raw;
}

export function resolveOpenRouterModel(model) {
  const normalized = normalizeModelId(model);
  if (!normalized) return "openai/gpt-4.1-mini";
  return OPENROUTER_MODEL_ALIASES[normalized] || normalized;
}

async function readKeychainSecret(args) {
  try {
    const { stdout } = await execFileAsync("security", args, { timeout: 4000 });
    return String(stdout || "").trim();
  } catch {
    return "";
  }
}

export async function readKeychainOpenRouterKey() {
  if (process.platform !== "darwin") return "";

  const attempts = [
    ["find-generic-password", "-s", "openrouter-api-key", "-w"],
    ["find-generic-password", "-s", "nexus-auto-info", "-a", "OPENROUTER_API_KEY", "-w"],
    ["find-generic-password", "-s", "OPENROUTER_API_KEY", "-w"]
  ];

  for (const args of attempts) {
    const value = await readKeychainSecret(args);
    if (value) return value;
  }
  return "";
}

export function readConfiguredOpenRouterApiKey(config) {
  const fromConfig = String(config?.llm?.apiKey || "").trim();
  if (fromConfig) return fromConfig;
  return String(process.env.OPENROUTER_API_KEY || "").trim();
}

export async function resolveOpenRouterApiKey(config) {
  const configured = readConfiguredOpenRouterApiKey(config);
  if (configured) return configured;
  return readKeychainOpenRouterKey();
}

export async function detectOpenRouterKeySource(config) {
  if (String(config?.llm?.apiKey || "").trim()) return "config";
  if (String(process.env.OPENROUTER_API_KEY || "").trim()) return "env";
  const keychain = await readKeychainOpenRouterKey();
  return keychain ? "keychain" : "missing";
}

export async function testOpenRouterModel(apiKey, model, requestedModel = "") {
  const resolvedModel = resolveOpenRouterModel(model);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Nexus Auto-Intel LLM Test"
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: 16,
        temperature: 0,
        messages: [{ role: "user", content: "Reply with exactly: OK" }]
      })
    });

    const elapsedMs = Date.now() - started;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        requestedModel: requestedModel || model,
        model: resolvedModel,
        status: response.status,
        elapsedMs,
        message: payload?.error?.message || payload?.error || "OpenRouter request failed"
      };
    }

    const content = String(payload?.choices?.[0]?.message?.content || "").trim();
    return {
      ok: true,
      requestedModel: requestedModel || model,
      model: resolvedModel,
      status: response.status,
      elapsedMs,
      message: content.slice(0, 80) || "ok"
    };
  } catch (error) {
    return {
      ok: false,
      requestedModel: requestedModel || model,
      model: resolvedModel,
      status: "error",
      elapsedMs: Date.now() - started,
      message: error.name === "AbortError" ? "timeout after 25s" : error.message
    };
  } finally {
    clearTimeout(timer);
  }
}
