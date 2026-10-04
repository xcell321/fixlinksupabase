// AI provider configuration.
//
// There are TWO independent axes, because the text workload and the image
// workload do not have to live in the same place:
//
//   TEXT    the assistant (chatbot), technician ranking, the repair analyzer
//   VISION  the UAT #6/#9/#10 screening — device photos, IDs, selfies
//
// A deployment can keep a self-hosted gateway for chat while sending image
// screening to a hosted API. Set AI_VISION_PROVIDER to split them; leave it
// unset and vision follows the text provider.
//
// Every provider may be given SEVERAL keys, tried in order, so an exhausted
// free-tier key falls through to the next one instead of taking screening
// offline. Keys are supplied either as a comma-separated list
// (AI_API_KEYS / AI_VISION_API_KEYS) or through the provider's own variables
// (GEMINI_API_KEY + GEMINI_API_KEY_BACKUP, OMNIROUTE_API_KEY). Each axis only
// collects its own provider's keys.
//
// Provider selection:
//   AI_PROVIDER=gemini     -> Gemini's OpenAI-compatibility endpoint
//   AI_PROVIDER=omniroute  -> the local gateway preset
//   AI_PROVIDER=custom     -> a fully hand-configured endpoint
// With AI_PROVIDER unset the provider is inferred, so a `.env` written before
// this module existed keeps working untouched.
//
// Precedence for every individual setting is:
//   1. the `AI_*` / `AI_VISION_*` variable,
//   2. the legacy `OMNIROUTE_*` alias, but ONLY while that axis is on OmniRoute,
//   3. the provider's preset, then DEFAULT_*.
// Gating step 2 on the provider is deliberate: a leftover gateway URL in a
// `.env` that has been switched to Gemini must not hijack the new provider.

const PRESETS = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    visionDefaultModel: 'gemini-3.8-flash',
  },
  omniroute: {
    baseUrl: 'http://localhost:20128/v1',
    defaultModel: 'auto',
    // Empty on purpose: a gateway that serves text can be given its vision model
    // by OMNIROUTE_VISION_MODEL, and otherwise reuses the text model below.
    visionDefaultModel: '',
  },
  custom: {
    baseUrl: '',
    defaultModel: 'auto',
    visionDefaultModel: '',
  },
};

// Fallbacks for an empty .env. Every value is still read from the environment on
// each call — these constants exist so no threshold is a literal at the point of
// use, which is what the "nothing is hardcoded" rule means here.
const DEFAULTS = {
  baseUrl: 'http://localhost:20128/v1',
  model: 'auto',
  timeoutMs: 15000,
  visionTimeoutMs: 60000,
  // Thinking models (Gemini 3.x) spend part of this budget on hidden reasoning
  // before writing their answer, so a small value returns `finish_reason:
  // length` with empty content. 2048 leaves room for both.
  maxTokens: 2048,
  visionMaxTokens: 2048,
  // Sent only when set: strict OpenAI-compatible providers reject unknown
  // parameters. Gemini 3 accepts `low`, which keeps the thinking budget small.
  reasoningEffort: '',
};

const VALID_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high'];

// First defined, non-empty value wins.
const firstDefined = (values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return undefined;
};

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const stripTrailingSlash = (url) => String(url || '').replace(/\/+$/, '');

const splitList = (raw) => String(raw || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const explicitProviderName = (raw) => {
  const named = firstDefined([raw]);
  if (!named) return undefined;
  const key = named.toLowerCase();
  return Object.prototype.hasOwnProperty.call(PRESETS, key) ? key : 'custom';
};

// --- text axis -------------------------------------------------------------

const textProviderName = () => {
  const named = explicitProviderName(process.env.AI_PROVIDER);
  if (named) return named;
  // Inferred, for configuration written before AI_* existed.
  if (process.env.GEMINI_API_KEY && !process.env.AI_BASE_URL && !process.env.OMNIROUTE_BASE_URL) return 'gemini';
  return 'omniroute';
};

// Vision follows the text provider unless it is given its own.
const visionProviderName = () => explicitProviderName(process.env.AI_VISION_PROVIDER) || textProviderName();

const textPreset = () => PRESETS[textProviderName()] || PRESETS.custom;
const visionPreset = () => PRESETS[visionProviderName()] || PRESETS.custom;

// The precedence ladder described at the top of the file. Values are passed in
// already read (every read is a static `process.env.X` member expression, which
// is what the env audit requires) and only the resolved value is returned.
// The OMNIROUTE_* names are this module's older spelling of the SAME settings,
// so they are honoured only while that axis is actually on OmniRoute.
const omniLegacy = (provider, value) => (provider === 'omniroute' ? value : undefined);

const setting = ({ explicit, legacy, presetValue, fallback }) => {
  const direct = firstDefined([explicit]);
  if (direct !== undefined) return direct;

  const aliased = firstDefined([legacy]);
  if (aliased !== undefined) return aliased;

  const preset = presetValue ? presetValue() : undefined;
  if (preset !== undefined && preset !== '') return preset;

  return fallback;
};

const aiBaseUrl = () => stripTrailingSlash(setting({
  explicit: process.env.AI_BASE_URL,
  legacy: omniLegacy(textProviderName(), process.env.OMNIROUTE_BASE_URL),
  presetValue: () => textPreset().baseUrl,
  fallback: DEFAULTS.baseUrl,
}));

// The vision endpoint defaults to the text one: "same provider, vision model"
// is the common case and should not need a second URL.
const aiVisionBaseUrl = () => stripTrailingSlash(setting({
  explicit: process.env.AI_VISION_BASE_URL,
  legacy: omniLegacy(visionProviderName(), process.env.OMNIROUTE_VISION_BASE_URL),
  presetValue: () => visionPreset().baseUrl,
  fallback: aiBaseUrl(),
}));

// --- keys ------------------------------------------------------------------

// The provider's own variables, written out per provider so every read stays
// statically analysable (the env audit rejects computed-key reads).
const nativeKeyVars = (provider) => {
  switch (provider) {
    case 'gemini':
      return [process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_BACKUP];
    case 'omniroute':
      return [process.env.OMNIROUTE_API_KEYS, process.env.OMNIROUTE_API_KEY];
    default:
      return [process.env.AI_API_KEY];
  }
};

// Ordered, de-duplicated. The first key is used until it is rejected. Only the
// provider's OWN keys are collected: a Gemini key sent to the local gateway (or
// the reverse) would just be a wasted 401 on the way down the list.
const buildKeyList = ({ explicitList, explicitSingle, provider }) => [
  ...splitList(explicitList),
  ...splitList(explicitSingle),
  ...nativeKeyVars(provider).flatMap(splitList),
];

const aiApiKeys = () => [...new Set(buildKeyList({
  explicitList: process.env.AI_API_KEYS,
  explicitSingle: process.env.AI_API_KEY,
  provider: textProviderName(),
}))];

const aiVisionApiKeys = () => {
  const keys = [...new Set(buildKeyList({
    explicitList: process.env.AI_VISION_API_KEYS,
    explicitSingle: process.env.AI_VISION_API_KEY,
    provider: visionProviderName(),
  }))];
  if (keys.length > 0) return keys;
  // With no key of its own, vision may borrow the text provider's — but only
  // when it IS the same provider. A different provider means those keys are
  // worthless here, so vision stays unconfigured and screening degrades to
  // local forensics instead of failing every call.
  return visionProviderName() === textProviderName() ? aiApiKeys() : [];
};

// --- models and budgets ----------------------------------------------------

const aiModel = () => setting({
  explicit: process.env.AI_MODEL,
  legacy: omniLegacy(textProviderName(), process.env.OMNIROUTE_MODEL),
  presetValue: () => textPreset().defaultModel,
  fallback: DEFAULTS.model,
});

const aiVisionModel = () => setting({
  explicit: process.env.AI_VISION_MODEL,
  legacy: omniLegacy(visionProviderName(), process.env.OMNIROUTE_VISION_MODEL),
  presetValue: () => visionPreset().visionDefaultModel,
  // Same endpoint means "same provider, vision model", which is the common case
  // and should not need a second model name.
  fallback: aiVisionBaseUrl() === aiBaseUrl() ? aiModel() : DEFAULTS.model,
});

const aiVisionFallbackModels = () => [...new Set(splitList(setting({
  explicit: process.env.AI_VISION_FALLBACK_MODELS,
  legacy: omniLegacy(visionProviderName(), process.env.OMNIROUTE_VISION_FALLBACK_MODELS),
  presetValue: () => '',
  fallback: '',
})))].filter((model) => model !== aiVisionModel());

const aiTimeoutMs = () => asInt(setting({
  explicit: process.env.AI_TIMEOUT_MS,
  legacy: omniLegacy(textProviderName(), process.env.OMNIROUTE_TIMEOUT_MS),
  presetValue: () => '',
  fallback: '',
}), DEFAULTS.timeoutMs);

// Screening sends images, which are slower than text on every hosted API.
const aiVisionTimeoutMs = () => asInt(setting({
  explicit: process.env.AI_VISION_TIMEOUT_MS,
  legacy: omniLegacy(visionProviderName(), process.env.OMNIROUTE_VISION_TIMEOUT_MS),
  presetValue: () => '',
  fallback: '',
}), Math.max(aiTimeoutMs(), DEFAULTS.visionTimeoutMs));

const aiMaxTokens = () => asInt(setting({
  explicit: process.env.AI_MAX_TOKENS,
  legacy: omniLegacy(textProviderName(), process.env.OMNIROUTE_MAX_TOKENS),
  presetValue: () => '',
  fallback: '',
}), DEFAULTS.maxTokens);

const aiVisionMaxTokens = () => asInt(setting({
  explicit: process.env.AI_VISION_MAX_TOKENS,
  legacy: omniLegacy(visionProviderName(), process.env.OMNIROUTE_VISION_MAX_TOKENS),
  presetValue: () => '',
  fallback: '',
}), DEFAULTS.visionMaxTokens);

const aiReasoningEffort = () => {
  const raw = setting({
    explicit: process.env.AI_REASONING_EFFORT,
    legacy: omniLegacy(visionProviderName(), process.env.OMNIROUTE_REASONING_EFFORT),
    presetValue: () => '',
    fallback: '',
  });
  const normalized = String(raw || '').toLowerCase();
  return VALID_REASONING_EFFORTS.includes(normalized) ? normalized : DEFAULTS.reasoningEffort;
};

// --- status ----------------------------------------------------------------

// True when the text axis has an endpoint AND at least one key.
const isAiConfigured = () => Boolean(aiBaseUrl() && aiApiKeys().length > 0);

// True when the vision axis does. Everything AI-powered on the image side checks
// this and degrades to local forensics when it is false.
const isVisionConfigured = () => Boolean(aiVisionBaseUrl() && aiVisionApiKeys().length > 0);

module.exports = {
  PRESETS,
  DEFAULTS,
  VALID_REASONING_EFFORTS,
  textProviderName,
  visionProviderName,
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
};
