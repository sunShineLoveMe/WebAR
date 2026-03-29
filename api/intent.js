const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL_NAME = "kimi-k2.5";
const ACTION_KEYS = new Set(["greeting", "dancing", "unknown"]);

const normalizeBaseUrl = (value) => {
  const base = String(value || "").trim() || DEFAULT_BASE_URL;
  return base.endsWith("/v1") ? base : `${base.replace(/\/+$/, "")}/v1`;
};

const extractJson = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    try {
      return JSON.parse(raw.slice(braceStart, braceEnd + 1));
    } catch {}
  }

  return null;
};

const mapIntent = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (ACTION_KEYS.has(normalized)) return normalized;
  if (normalized.includes("dance") || normalized.includes("跳")) return "dancing";
  if (normalized.includes("greet") || normalized.includes("wave") || normalized.includes("招呼")) return "greeting";
  return "unknown";
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "LLM_API_KEY is not configured" });
  }

  const text = String(req.body?.text || "").trim();
  if (!text) {
    return res.status(400).json({ error: "Missing text" });
  }

  const baseUrl = normalizeBaseUrl(process.env.LLM_BASE_URL);
  const model = String(process.env.LLM_MODEL_NAME || "").trim() || DEFAULT_MODEL_NAME;

  const systemPrompt =
    "你是一个火柴人AR动作意图分类器。你的任务不是聊天，而是把用户的中文口语命令映射为固定动作ID。只允许输出 JSON，格式为 " +
    '{"intent":"greeting|dancing|unknown","reply":"简短中文回复，20字以内"}。' +
    "如果用户表达打招呼、挥手、招手、问好，intent=greeting。" +
    "如果用户表达跳舞、来一段、舞蹈、摇摆，intent=dancing。" +
    "如果无法判断，intent=unknown。不要输出任何额外解释。";

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text }
        ]
      })
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: payload?.error?.message || payload?.message || "Kimi intent request failed"
      });
    }

    const content = payload?.choices?.[0]?.message?.content || "";
    const parsed = extractJson(content);
    const intent = mapIntent(parsed?.intent);
    const reply = String(parsed?.reply || "").trim();

    return res.status(200).json({
      intent,
      reply,
      source: "kimi"
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Intent service failed"
    });
  }
}
