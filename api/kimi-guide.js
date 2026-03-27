module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = (process.env.LLM_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(500).json({ error: "Missing LLM_API_KEY" });
  }

  const envBaseUrl = (process.env.LLM_BASE_URL || "").trim();
  const normalizedBaseUrl = (envBaseUrl || "https://api.moonshot.cn/v1").replace(/\/$/, "");
  const baseUrl = /\/v\d+$/.test(normalizedBaseUrl) ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;

  const envModel = (process.env.LLM_MODEL_NAME || "").trim();
  const modelCandidates = envModel
    ? [envModel]
    : [
        "kimi-k2.5",
        "moonshotai/Kimi-K2.5",
        "kimi-k2",
        "moonshot-v1-8k"
      ];

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const question = String(body.question || "").trim();
  if (!question) {
    return res.status(400).json({ error: "Missing question" });
  }

  const systemPrompt =
    "你是沪小宝，是一名热情、专业、表达简洁的上海城市旅游导览助手。" +
    "你只能回答与上海旅游相关的话题，包括景点、美食、交通、夜游、历史文化、游玩路线与旅行建议。" +
    "如果用户问题超出上海旅游范围，礼貌拒绝，并把话题引导回上海旅行。" +
    "回答适合手机语音播报，使用自然口语中文，控制在120到180字之间，避免条目符号。";

  const upstreamErrors = [];

  for (const model of modelCandidates) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.6,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question }
          ]
        })
      });

      if (!response.ok) {
        const text = await response.text();
        upstreamErrors.push({ model, status: response.status, details: text });
        continue;
      }

      const data = await response.json();
      const answer = data?.choices?.[0]?.message?.content?.trim();
      if (!answer) {
        upstreamErrors.push({ model, status: 502, details: "Empty model response" });
        continue;
      }

      return res.status(200).json({ answer, model, baseUrl });
    } catch (error) {
      upstreamErrors.push({
        model,
        status: 500,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const lastError = upstreamErrors[upstreamErrors.length - 1] || null;
  return res.status(lastError?.status || 500).json({
    error: "Guide request failed",
    details: lastError?.details || "Unknown upstream failure",
    modelTried: modelCandidates,
    baseUrl
  });
};
