// OpenAI-compatible AI client.
//
// Two named workloads, each with its own endpoint, key list and model chain:
//
//   chatComplete    TEXT   — assistant (chatbot), technician ranking, analyzer
//   visionComplete  VISION — UAT #6/#9/#10 screening (photos, IDs, selfies)
//
// Everything comes from domain/aiProvider.js, so pointing either workload at a
// different service, or adding a backup key, is configuration rather than code.
//
// Uses native fetch + AbortController, matching services/geocodeService.js.

const {
  aiBaseUrl,
  aiVisionBaseUrl,
  aiApiKeys,
  aiVisionApiKeys,
  aiModel,
  aiVisionModel,
  aiVisionFallbackModels,
  aiTimeoutMs,
  aiVisionTimeoutMs,
  aiMaxTokens,
  aiVisionMaxTokens,
  aiReasoningEffort,
  isAiConfigured,
  isVisionConfigured,
  DEFAULTS,
} = require('../domain/aiProvider');

// A completion is attempted in this order and stops at the first usable answer:
//   - the same model without the optional parameters (400 = a provider that
//     does not implement `response_format` / `reasoning_effort`), then
//   - the same model with a doubled token budget (a thinking model that spent
//     the whole budget on hidden reasoning returns empty content).
// A timeout, a 429 or a 5xx is NOT retried on the same model: the next key or
// the next model in the chain is tried instead, which keeps the worst case
// bounded. Hammering an overloaded model triples latency for the same failure.
const EMPTY_CONTENT_BACKOFF = 2;

// A hosted model can shed load for a few seconds. One second pass over the whole
// chain — after a short pause — turns that into a slow answer rather than an
// outage, without looping indefinitely.
const TRANSIENT_RETRY_PASSES = 2;
const TRANSIENT_RETRY_DELAY_MS = 1500;

// The smallest slice of the budget one model is allowed to consume. It keeps a
// fast, working fallback from being starved by a model ahead of it that hangs
// until its own timeout.
const MIN_ATTEMPT_MS = 8000;

const isParameterRejection = (status) => status === 400;

// Worth another look later: throttling, a quota, or a temporary outage.
const isTransientStatus = (status) =>
  status === 408 || status === 429 || (typeof status === 'number' && status >= 500 && status <= 599);

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

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

const postCompletion = async ({ baseUrl, apiKey, body, timeoutMs }) => {
  if (!apiKey) throw new Error('No AI provider API key is configured.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const readCompletion = async (response) => {
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`AI request failed (${response.status}): ${detail.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    // `finish_reason: length` here means the reasoning pass consumed the whole
    // budget before the model wrote its answer.
    const error = new Error(`AI returned an empty completion (finish_reason: ${choice?.finish_reason || 'unknown'}).`);
    error.emptyCompletion = true;
    throw error;
  }
  return { content, raw: data, finishReason: choice?.finish_reason };
};

// `timeoutMs` is this model's slice of the global budget; `deadline` is the
// global one. Every attempt takes the smaller of the two, so the three
// parameter/empty-content retries cannot each burn a full slice and overrun the
// chain. Returns the last error when the deadline passes before a second try.
const completeWithModel = async ({ baseUrl, apiKey, model, temperature, maxTokens, messages, timeoutMs, deadline }) => {
  const reasoningEffort = aiReasoningEffort();
  const attempts = [
    {
      body: {
        model,
        temperature,
        max_tokens: maxTokens,
        messages,
        response_format: { type: 'json_object' },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      },
    },
    { body: { model, temperature, max_tokens: maxTokens, messages } },
    {
      body: {
        model,
        temperature,
        max_tokens: maxTokens * EMPTY_CONTENT_BACKOFF,
        messages,
      },
    },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    const remaining = deadline ? deadline - Date.now() : timeoutMs;
    if (remaining <= 0) break;
    try {
      const response = await postCompletion({
        baseUrl,
        apiKey,
        body: attempt.body,
        timeoutMs: Math.min(timeoutMs, remaining),
      });
      return await readCompletion(response);
    } catch (error) {
      lastError = error;
      if (!isParameterRejection(error.status) && !error.emptyCompletion) break;
    }
  }
  throw lastError || new Error('AI completion failed.');
};

// Walks every key, and for each key every model, stopping at the first answer.
//
// The whole cross-product is tried before giving up, deliberately. A 429 is not
// proof that the KEY is spent: Gemini meters quota per model, so the model at
// the head of the chain can be throttled while a later one answers instantly.
// Skipping the remaining models on the first 429 is what turned a healthy
// fallback chain into an outage. The status only decides whether a whole second
// pass over the chain is worth it, never whether to stop early.
//
// `timeoutMs` bounds the WHOLE chain, not each attempt. Per-attempt timeouts
// meant a primary model that hung until its own deadline starved every fallback
// behind it, and a chain that should take seconds could take minutes. Each
// attempt now gets the smaller of the remaining budget and the configured
// timeout, so the first answer still wins and the worst case is one timeout.
const completeJson = async ({ baseUrl, keys, models, temperature, maxTokens, messages, timeoutMs }) => {
  const budget = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULTS.timeoutMs;
  const deadline = Date.now() + budget;
  const perPass = keys.length * models.length;
  let lastError = null;

  for (let pass = 0; pass < TRANSIENT_RETRY_PASSES; pass += 1) {
    if (pass > 0) {
      if (Date.now() >= deadline) break;
      await sleep(Math.min(TRANSIENT_RETRY_DELAY_MS, Math.max(0, deadline - Date.now())));
    }

    let tried = 0;
    for (const apiKey of keys) {
      for (const model of models) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          lastError = lastError || new Error('AI request timed out.');
          break;
        }
        // Divide what is left between this attempt and the ones still queued, so
        // a model that hangs cannot leave the fallbacks behind it with no time
        // at all. A throttled model fails in well under a second and so leaves
        // most of the budget for the model that actually answers.
        const slice = Math.max(MIN_ATTEMPT_MS, Math.floor(remaining / Math.max(1, perPass - tried)));
        tried += 1;
        try {
          const { content, raw, finishReason } = await completeWithModel({
            baseUrl,
            apiKey,
            model,
            temperature,
            maxTokens,
            messages,
            timeoutMs: slice,
            deadline,
          });
          return { content, raw, model, finishReason };
        } catch (error) {
          lastError = error;
        }
      }
      if (Date.now() >= deadline) break;
    }

    // Only a throttled, quota-limited or overloaded provider is worth a second
    // pass; a wrong model name or an invalid key would fail identically.
    if (!isTransientStatus(lastError?.status)) break;
  }

  throw lastError || new Error('AI completion failed.');
};

const parseOrThrow = (content, label) => {
  try {
    return JSON.parse(content);
  } catch (_) {
    const parsed = extractJson(content);
    if (parsed !== undefined) return parsed;
    throw new Error(`The AI provider returned invalid JSON${label ? ` (${label})` : ''}.`);
  }
};

// TEXT — the assistant (chatbot), technician ranking and the repair analyzer.
// `json: true` (the default) parses the reply, because ranking and the analyzer
// ask for JSON objects. The assistant passes `json: false`: it wants the plain
// text reply, and parsing prose would throw it away.
const chatComplete = async ({ system, user, json = true, temperature = 0.2, maxTokens = aiMaxTokens() }) => {
  if (!isAiConfigured()) throw new Error('No AI provider is configured for text completion.');

  const { content, raw } = await completeJson({
    baseUrl: aiBaseUrl(),
    keys: aiApiKeys(),
    models: [aiModel()],
    temperature,
    maxTokens,
    timeoutMs: aiTimeoutMs(),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  // `content` is always returned as text; `parsed` only when JSON was requested.
  return { content, parsed: json ? parseOrThrow(content) : undefined, raw };
};

// VISION — UAT #6/#9/#10 screening. One or more images plus a text instruction,
// returning parsed JSON. Tries the vision model first, then each configured
// fallback, so one misbehaving or overloaded model cannot take screening
// offline. Throws only when every key and every model has failed.
const visionComplete = async ({
  system,
  user,
  images = [],
  temperature = 0.1,
  maxTokens = aiVisionMaxTokens(),
  timeoutMs,
}) => {
  if (!isVisionConfigured()) throw new Error('No AI provider is configured for vision screening.');
  if (!Array.isArray(images) || images.length === 0) throw new Error('visionComplete needs at least one image.');

  const models = [...new Set([aiVisionModel(), ...aiVisionFallbackModels()])];
  const messages = [
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
  ];

  const { content, raw, model } = await completeJson({
    baseUrl: aiVisionBaseUrl(),
    keys: aiVisionApiKeys(),
    models,
    temperature,
    maxTokens,
    timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : aiVisionTimeoutMs(),
    messages,
  });

  return { content, parsed: parseOrThrow(content, 'vision'), raw, model };
};

module.exports = {
  chatComplete,
  visionComplete,
  isAiConfigured,
  isVisionConfigured,
  extractJson,
  isTransientStatus,
};
