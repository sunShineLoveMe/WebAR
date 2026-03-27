module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.moonshot.cn/v1";
  const model = process.env.LLM_MODEL_NAME || "kimi-k2.5";

  if (!apiKey) {
    return res.status(500).json({ error: "Missing LLM_API_KEY" });
  }

  const body =
    typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : req.body || {};

  const question = String(body.question || "").trim();
  if (!question) {
    return res.status(400).json({ error: "Missing question" });
  }

  const systemPrompt =
    "你是沪小宝，是一名热情、专业、表达简洁的上海城市旅游导览助手。"
    + "你只能回答与上海旅游相关的话题，包括景点、美食、交通、夜游、历史文化、游玩路线与旅行建议。"
    + "如果用户问题超出上海旅游范围，礼貌拒绝，并把话题引导回上海旅行。"
    + "回答适合手机语音播报，使用自然口语中文，控制在120到180字之间，避免条目符号。";

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
      return res.status(response.status).json({ error: "Upstream model error", details: text });
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return res.status(502).json({ error: "Empty model response" });
    }

    return res.status(200).json({ answer });
  } catch (error) {
    return res.status(500).json({
      error: "Guide request failed",
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
