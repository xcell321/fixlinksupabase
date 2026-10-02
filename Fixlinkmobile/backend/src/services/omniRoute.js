const DEFAULT_BASE_URL = 'http://localhost:20128/v1';

const getBaseUrl = () => (process.env.OMNIROUTE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const getModel = () => process.env.OMNIROUTE_MODEL || 'auto';
const getTimeoutMs = () => Number(process.env.OMNIROUTE_TIMEOUT_MS) || 15000;

// Text models power the assistant, the repair analyzer and technician ranking.
// Vision is a separate axis: image screening needs a multimodal model. Both
// lists are env-driven so the gateway's model names can change without a code
// change.
const getVisionModel = () => process.env.OMNIROUTE_VISION_MODEL || getModel();
const getVisionFallbackModels = () => String(process.env.OMNIROUTE_VISION_FALLBACK_MODELS || '')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

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

const parseVisionJson = (data) => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OmniRoute returned an empty vision completion.');
  }
  try {
    return JSON.parse(content);
  } catch (_) {
    const parsed = extractJson(content);
    if (parsed !== undefined) return parsed;
    throw new Error('OmniRoute returned invalid JSON from the vision model.');
  }
};

// Multimodal completion: one or more images plus a text instruction, returning
// parsed JSON. Tries OMNIROUTE_VISION_MODEL first, then each entry of
// OMNIROUTE_VISION_FALLBACK_MODELS, so one misbehaving model cannot take
// credential screening offline. Throws only when every model fails.
const visionComplete = async ({ system, user, images = [], temperature = 0.1, maxTokens = 800, timeoutMs }) => {
  const apiKey = process.env.OMNIROUTE_API_KEY;
  if (!apiKey) throw new Error('OMNIROUTE_API_KEY is not configured.');
  if (!Array.isArray(images) || images.length === 0) throw new Error('visionComplete needs at least one image.');

  const models = [getVisionModel(), ...getVisionFallbackModels()];
  const budget = Number(timeoutMs) > 0 ? Number(timeoutMs) : getTimeoutMs();
  let lastError = null;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
    let response;
    try {
      response = await fetch(`${getBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content: [
                { type: 'text', text: user },
                ...images.map((image) => ({
                  type: 'image_url',
                  image_url: { url: `data:${image.mimeType || 'image/jpeg'};base64,${image.base64}` },
                })),
              ],
            },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
    } catch (error) {
      lastError = error;
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      lastError = new Error(`OmniRoute vision failed (${response.status}): ${body.slice(0, 200)}`);
      continue;
    }
    try {
      const data = await response.json();
      return { parsed: parseVisionJson(data), raw: data, model };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Vision completion failed.');
};

module.exports = {
  chatComplete,
  visionComplete,
  isOmniRouteConfigured,
  getBaseUrl,
  getModel,
  getVisionModel,
  getVisionFallbackModels,
};