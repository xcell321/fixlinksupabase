// Assistant language state + detection.
// Extracted from routes/ai.js. The per-customer preference stays module-level
// (survives across requests, resets on backend restart) with identical logic.

const langPrefs = new Map();

const switchTarget = (t) => {
  const s = ` ${String(t || '').toLowerCase()} `;
  const wants = (names) => names.some((n) => s.includes(` ${n} `) || s.includes(` ${n}?`) || s.includes(` ${n}.`) || s.includes(` ${n},`) || s.includes(` ${n}!`));
  const verbs = ['speak', 'switch', 'use', 'using', 'only', 'convers', 'istorya', 'mag ', 'prefer', 'let us', 'lets ', 'lang ', ' lang'];
  const hasVerb = verbs.some((v) => s.includes(v));
  if ((wants(['english']) || s.includes(' mag english') || s.includes(' in english')) && (hasVerb || s.trim().length < 30)) return 'English';
  if (wants(['tagalog']) && (hasVerb || s.trim().length < 30)) return 'Tagalog';
  if ((wants(['bisaya', 'cebuano', 'binisaya']) || s.includes(' mag bisaya') || s.includes(' sa bisaya')) && (hasVerb || s.trim().length < 30)) return 'Bisaya';
  return null;
};

// Language detection (logic only, no canned answers): Bisaya, Tagalog, or English.
const detectLanguage = (t) => {
  const s = ` ${String(t || '').toLowerCase()} `;
  const has = (words) => words.some((w) => s.includes(` ${w} `) || s.includes(` ${w}?`) || s.includes(` ${w}!`) || s.includes(` ${w}.`) || s.includes(` ${w},`));
  const bisaya = ['unsa', 'unsaon', 'ngano', 'asa', 'kanus-a', 'kanusa', 'kinsa', 'kinsay', 'pila', 'pwede', 'lage', 'jud', 'gyud', 'kaayo', 'nako', 'nimo', 'niya', 'akoa', 'imoha', 'ila', 'diri', 'didto', 'dinhi', 'didto', 'karon', 'ugma', 'gahapon', 'salamat', 'palihug', 'maayong', 'kumusta', 'gani', 'nindot', 'dili', 'wala', 'naa', 'tabang', 'pangan', 'buhat', 'tan-aw', 'tanawa'];
  const tagalog = ['ano', 'paano', 'bakit', 'saan', 'kailan', 'sino', 'magkano', 'puwede', 'kamusta', 'naman', 'gusto', 'kailangan', 'akin', 'iyo', 'dito', 'doon', 'ngayon', 'bukas', 'salamat', 'paki'];
  if (has(bisaya)) return 'Bisaya';
  if (has(tagalog)) return 'Tagalog';
  return 'English';
};

const resolveAssistantLanguage = (text, customerKey) => {
  const target = switchTarget(text);
  if (target) {
    if (customerKey) langPrefs.set(customerKey, target);
    return { lang: target, switched: true };
  }
  if (customerKey && langPrefs.get(customerKey)) {
    return { lang: langPrefs.get(customerKey), switched: false };
  }
  return { lang: detectLanguage(text), switched: false };
};

module.exports = { langPrefs, switchTarget, detectLanguage, resolveAssistantLanguage };
