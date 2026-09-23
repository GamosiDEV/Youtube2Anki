// Chamada à API de IA no padrão OpenAI (/chat/completions).
// Funciona com OpenRouter, OpenAI, Gemini (endpoint OpenAI-compatible) etc.,
// bastando alterar AI_BASE_URL / AI_MODEL no .env.

const AI_TIMEOUT_MS = 5 * 60 * 1000;
const AI_MAX_ATTEMPTS = 2;

class AIError extends Error {}

function aiConfig() {
  const c = window.APP_CONFIG || {};
  return {
    apiKey: (c.AI_API_KEY || "").trim(),
    baseUrl: (c.AI_BASE_URL || "https://openrouter.ai/api/v1").trim().replace(/\/+$/, ""),
    model: (c.AI_MODEL || "").trim(),
    temperature: c.AI_TEMPERATURE === "" || c.AI_TEMPERATURE == null ? null : Number(c.AI_TEMPERATURE),
    maxTokens: c.AI_MAX_TOKENS ? parseInt(c.AI_MAX_TOKENS, 10) : null,
  };
}

async function requestCompletion(cfg, messages) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.baseUrl.includes("openrouter.ai")) headers["X-Title"] = "Youtube2Anki";

  const body = { model: cfg.model, messages, response_format: { type: "json_object" } };
  if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;
  if (Number.isFinite(cfg.maxTokens) && cfg.maxTokens > 0) body.max_tokens = cfg.maxTokens;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new AIError("A IA demorou demais para responder (tempo esgotado).");
    throw new AIError(`Não foi possível conectar à API de IA (${cfg.baseUrl}). Verifique AI_BASE_URL e sua conexão.`);
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  const apiMessage = data?.error?.message || data?.message || "";

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AIError(`Chave de API inválida ou sem permissão (AI_API_KEY). ${apiMessage}`);
    if (res.status === 402) throw new AIError(`Sem créditos na conta da API. ${apiMessage}`);
    if (res.status === 404) throw new AIError(`Modelo ou endpoint não encontrado. Verifique AI_MODEL e AI_BASE_URL. ${apiMessage}`);
    if (res.status === 429) throw new AIError(`Limite de requisições atingido na API de IA. Aguarde e tente novamente. ${apiMessage}`);
    throw new AIError(`A API de IA retornou erro ${res.status}. ${apiMessage}`);
  }
  // Alguns provedores (ex.: OpenRouter) devolvem erro com status 200.
  if (data?.error) throw new AIError(`A API de IA retornou um erro: ${apiMessage || JSON.stringify(data.error)}`);

  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (!content || !String(content).trim()) {
    const reason = choice?.finish_reason === "length" ? " A resposta foi cortada por limite de tokens (ajuste AI_MAX_TOKENS)." : "";
    throw new AIError(`A IA retornou uma resposta vazia.${reason}`);
  }
  return { content: String(content), finishReason: choice?.finish_reason };
}

function parseCardsJson(content) {
  let text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start === -1 || end <= start) throw new Error("JSON não encontrado na resposta");
  const parsed = JSON.parse(text.slice(start, end + 1));
  const cards = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(cards)) throw new Error('A resposta não contém a lista "cards"');
  return cards;
}

async function generateCards(input) {
  const cfg = aiConfig();
  if (!cfg.apiKey || cfg.apiKey === "coloque-sua-chave-aqui") {
    throw new AIError("AI_API_KEY não configurada. Preencha o .env e reinicie o app.py.");
  }
  if (!cfg.model) throw new AIError("AI_MODEL não configurado no .env.");

  // Chave de um provedor usada na URL de outro é o erro de configuração mais comum.
  const isOpenRouterKey = cfg.apiKey.startsWith("sk-or-");
  const isOpenRouterUrl = cfg.baseUrl.includes("openrouter.ai");
  if (isOpenRouterUrl && cfg.apiKey.startsWith("sk-") && !isOpenRouterKey) {
    throw new AIError('A chave parece ser da OpenAI, mas AI_BASE_URL aponta para o OpenRouter. No .env use AI_BASE_URL=https://api.openai.com/v1 e um AI_MODEL da OpenAI (ex.: gpt-4o-mini), depois reinicie o app.py.');
  }
  if (!isOpenRouterUrl && isOpenRouterKey) {
    throw new AIError('A chave é do OpenRouter (sk-or-...), mas AI_BASE_URL não aponta para ele. No .env use AI_BASE_URL=https://openrouter.ai/api/v1 e reinicie o app.py.');
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(input) },
  ];

  let lastError;
  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
    const { content, finishReason } = await requestCompletion(cfg, messages);
    try {
      return parseCardsJson(content);
    } catch (err) {
      const cut = finishReason === "length" ? " (resposta cortada por limite de tokens — aumente AI_MAX_TOKENS)" : "";
      lastError = new AIError(`A IA não retornou um JSON válido${cut}: ${err.message}.`);
      if (finishReason === "length") break;
    }
  }
  throw lastError;
}
