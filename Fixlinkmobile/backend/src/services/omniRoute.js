const DEFAULT_BASE_URL = 'http://localhost:20128/v1';

const getBaseUrl = () => (process.env.OMNIROUTE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const getModel = () => process.env.OMNIROUTE_MODEL || 'auto';
const getTimeoutMs = () => Number(process.env.OMNIROUTE_TIMEOUT_MS) || 15000;

// True when a base URL AND an API key are configured (gateway enabled).
const isOmniRouteConfigured = () => Boolean(process.env.OMNIROUTE_BASE_URL && process.env.OMNIROUTE_API_KEY);

// Stubborn JSON extraction: models sometimes wrap JSON in ``` fences or add
// prose around it. Try strict parse first, then fenced, then the first balanced
// object/array inside the text.
const extractJson = (content) => {
  const text = String(content || '').trim();
  const tryParse = (candidate) => {
    try {
      return JSON.parse(candidate);
    } catch (_) {
      return undefined;
    }
  };
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const direct = tryParse(fenced) || tryParse(text);
  if (direct !== undefined) return direct;

  const candidates = [];
  const firstObject = text.indexOf('{');
  const firstArray = text.indexOf('[');
  const openIndex = Math.min(
    firstObject >= 0 ? firstObject : Number.POSITIVE_INFINITY,
    firstArray >= 0 ? firstArray : Number.POSITIVE_INFINITY
  );
  if (openIndex !== Number.POSITIVE_INFINITY) {
    const closing = text[openIndex] === '{' ? '}' : ']';
    const closeIndex = text.lastIndexOf(closing);
    if (closeIndex > openIndex) candidates.push(text.slice(openIndex, closeIndex + 1));
  }
  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

// Minimal OpenAI-compatible chat-completion wrapper around the OmniRoute
// gateway. Uses native fetch + AbortController, matching services/geocodeService.js.
// When `json` is true the request asks for a structured JSON object and the
// parsed object is returned (throws if the model wraps it differently).
const chatComplete = async ({ system, user, temperature = 0.2, json = true, maxTokens = 600 }) => {
  const apiKey = process.env.OMNIROUTE_API_KEY;
  if (!apiKey) throw new Error('OMNIROUTE_API_KEY is not configured.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getTimeoutMs());
  let response;
  try {
    response = await fetch(`${getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getModel(),
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OmniRoute request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OmniRoute returned an empty completion.');
  }
  if (!json) return { content, raw: data };
  try {
    return { parsed: JSON.parse(content), raw: data };
  } catch (_) {
    const parsed = extractJson(content);
    if (parsed !== undefined) return { parsed, raw: data };
    throw new Error('OmniRoute returned invalid JSON.');
  }
};

module.exports = { chatComplete, isOmniRouteConfigured, getBaseUrl, getModel };