#!/usr/bin/env node
/* Responsiveness audit for the FixLink mobile build (react-native-web).
 *
 * Drives the running web build in headless Chrome through real device metrics
 * (phone, tablet, laptop, desktop) and reports, per screen, whether anything
 * spills past the viewport — the usual way a React Native layout "breaks" on a
 * different size — plus any console/page errors seen along the way.
 *
 * No dependencies: uses Node's built-in fetch + WebSocket and the DevTools
 * Protocol directly.
 *
 * Usage:
 *   npx expo start --web            (in one terminal)
 *   node scripts/responsiveAudit.js
 *
 * Optional env:
 *   AUDIT_URL / AUDIT_EMAIL / AUDIT_PASSWORD  sign in and audit signed-in tabs
 *   AUDIT_ROLE                               'technician' (default) or 'customer'
 *   AUDIT_OUT                                 screenshot folder
 *   AUDIT_CDP_PORT / CHROME_PATH              port / browser override
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_URL = process.env.AUDIT_URL || 'http://localhost:8081';
const CDP_PORT = Number(process.env.AUDIT_CDP_PORT || 9333);
const EMAIL = process.env.AUDIT_EMAIL || '';
const PASSWORD = process.env.AUDIT_PASSWORD || '';
const ROLE = (process.env.AUDIT_ROLE || 'technician').toLowerCase() === 'customer' ? 'customer' : 'technician';
const OUT_DIR = process.env.AUDIT_OUT || path.join(os.tmpdir(), 'fixlink-responsive-audit');

// Smallest phone first: if a layout survives 320px it survives the rest.
const DEVICES = [
  { name: 'phone-320', width: 320, height: 568, mobile: true },
  { name: 'phone-360', width: 360, height: 740, mobile: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true },
  { name: 'phone-428', width: 428, height: 926, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'laptop-1280', width: 1280, height: 800, mobile: false },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const findChrome = () => CHROME_CANDIDATES.find((candidate) => {
  try {
    return fs.existsSync(candidate);
  } catch (_) {
    return false;
  }
});

// Measures horizontal spill: the document, plus the widest offenders with a
// hint of what they are so the fix is obvious from the report alone. Elements
// inside a deliberate horizontal carousel (category chips, tab strips) are
// skipped — they are supposed to extend past the fold.
const MEASURE = `(() => {
  const InnerWidth = window.innerWidth;
  const doc = document.documentElement;
  const inScroller = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) return true;
      node = node.parentElement;
    }
    return false;
  };
  // A decoration that bleeds off-screen inside an overflow:hidden parent is
  // clipped on purpose (the splash glow), so it cannot break the layout.
  const isClipped = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if ((style.overflowX === 'hidden' || style.overflow === 'hidden')
        && node.getBoundingClientRect().right <= InnerWidth + 1) return true;
      node = node.parentElement;
    }
    return false;
  };
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const over = Math.round(rect.right - InnerWidth);
    if (over > 1 && !inScroller(el) && !isClipped(el)) {
      const text = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 42);
      offenders.push({ over, tag: el.tagName.toLowerCase(), text });
    }
  }
  offenders.sort((a, b) => b.over - a.over);
  return {
    viewport: InnerWidth,
    scrollWidth: doc.scrollWidth,
    overflow: doc.scrollWidth - InnerWidth,
    offenders: offenders.slice(0, 4),
  };
})()`;

// Clicks the smallest element whose text matches, which mirrors what a user
// taps (react-native-web forwards the click to the parent touchable).
const clickByText = (label) => `(() => {
  const wanted = ${JSON.stringify(label)}.toLowerCase();
  const nodes = [...document.querySelectorAll('div,span,button,input,a')];
  const hit = nodes.reverse().find((node) => (node.textContent || '').trim().toLowerCase() === wanted);
  if (!hit) return false;
  hit.click();
  return true;
})()`;

// React ignores a plain value assignment, so use the native setter + event.
const fillInput = (selector, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      if (message.method) this.events.push(message);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 20000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'page error');
    return result.result ? result.result.value : undefined;
  }

  drainErrors() {
    const found = [];
    for (const event of this.events) {
      if (event.method === 'Runtime.exceptionThrown') {
        found.push(String(event.params?.exceptionDetails?.exception?.description || event.params?.exceptionDetails?.text || '').split('\n')[0]);
      }
      if (event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error') {
        found.push(event.params.args.map((a) => String(a.value ?? a.description ?? '')).join(' ').split('\n')[0]);
      }
      if (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') {
        found.push(String(event.params.entry.text || '').split('\n')[0]);
      }
    }
    this.events = [];
    // Dev-server noise that says nothing about layout (Metro's HMR socket and
    // the React DevTools banner are environment artifacts, not app defects).
    const ignore = /favicon|Download the React DevTools|source map|DevTools|net::ERR_CONNECTION|Invalid frame header|localhost:8081\/(hot|message)/i;
    return found.filter((line) => line && !ignore.test(line));
  }

  close() {
    try { this.socket.close(); } catch (_) { /* already closed */ }
  }
}

// Reads the dark header back out of the DOM: proof that the greeting and the
// service area carry real data (and that the name is not pushed off-screen).
const PROBE = `(() => {
  const lines = (document.body.innerText || '').split('\\n').map((s) => s.trim()).filter(Boolean);
  const areaIndex = lines.findIndex((line) => /^service area$/i.test(line));
  const greetIndex = lines.findIndex((line) => /^good (morning|afternoon|evening),$/i.test(line));
  const greeting = greetIndex >= 0 ? (lines[greetIndex + 1] || '') : '';
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), mid: Math.round(r.top + r.height / 2) };
  };
  let nameEl = null;
  for (const el of document.querySelectorAll('div,span')) {
    if (greeting && el.children.length === 0 && (el.textContent || '').trim() === greeting) { nameEl = el; break; }
  }
  const avatar = [...document.querySelectorAll('img')]
    .find((img) => img.getBoundingClientRect().width >= 24 && img.getBoundingClientRect().top < 220) || null;
  const nameBox = nameEl ? box(nameEl) : null;
  const avatarBox = avatar ? box(avatar) : null;
  return {
    greeting,
    serviceArea: areaIndex >= 0 ? (lines[areaIndex + 1] || '') : null,
    nameLeft: nameBox ? nameBox.left : null,
    avatarLeft: avatarBox ? avatarBox.left : null,
    // The requested layout: [profile pic] Name — picture immediately left of it.
    pictureLeftOfName: Boolean(avatarBox && nameBox && avatarBox.right <= nameBox.left + 1),
    pictureAlignedWithName: Boolean(avatarBox && nameBox && Math.abs(avatarBox.mid - nameBox.mid) <= 14),
    // True when a long name would be cut off with an ellipsis at this width.
    nameTruncated: nameEl ? nameEl.scrollWidth > nameEl.clientWidth + 1 : null,
  };
})()`;

// `sub` opens a tab strip inside the screen (the profile's Info/Skills/... row).
const TABS = ROLE === 'technician'
  ? [
    { id: 'jobs', tab: 'Jobs' },
    { id: 'map', tab: 'Map' },
    { id: 'message', tab: 'Message' },
    { id: 'profile', tab: 'Profile' },
    { id: 'profile-portfolio', tab: 'Profile', sub: 'Portfolio' },
  ]
  : [{ id: 'home', tab: 'Home' }, { id: 'repairs', tab: 'Repairs' }, { id: 'chat', tab: 'Chat' }, { id: 'profile', tab: 'Profile' }];

// Whatever is visible, verbatim — used to confirm the real values rendered.
const TEXT_PROBE = `(document.body.innerText || '').split('\\n').map((s) => s.trim()).filter(Boolean).slice(0, 42).join(' | ')`;

// Counts the presence dots on the message list: green = peer online,
// grey = peer not using the app. '#10B981' / '#C7CDD6' in RGB.
const DOT_PROBE = `(() => {
  let greenDots = 0;
  let greyDots = 0;
  for (const el of document.querySelectorAll('div')) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg === 'rgb(16, 185, 129)') greenDots += 1;
    else if (bg === 'rgb(199, 205, 214)') greyDots += 1;
  }
  const offlineHeader = (document.body.innerText || '').includes('Offline');
  const onlineHeader = /(^|\\n)Online(\\n|$)/.test(document.body.innerText || '');
  return { greenDots, greyDots, offlineHeader, onlineHeader };
})()`;

const waitForJson = async (url, attempts = 60) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (_) { /* chrome still starting */ }
    await sleep(500);
  }
  throw new Error(`Chrome did not answer on ${url}`);
};

// Fills and submits the login form that is already on screen.
const completeSignIn = async (cdp) => {
  // The login form opens on the customer portal; switch only for technicians.
  if (ROLE === 'technician') await click(cdp, 'Log in as technician');
  const filledEmail = await cdp.eval(fillInput('input[type="email"], input[autocomplete="email"], input:not([type="password"])', EMAIL));
  const filledPassword = await cdp.eval(fillInput('input[type="password"], input[autocomplete="current-password"]', PASSWORD));
  if (!filledEmail || !filledPassword) return { ok: false, reason: 'login inputs not found' };
  await cdp.eval(clickByText('Sign In'));
  // The first sign-in of a run can be slow (cold API + tunnel), so poll for the
  // signed-in header instead of guessing a single wait.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(700);
    const landed = await cdp.eval("(document.body.innerText || '').includes('Good afternoon')");
    if (landed) return { ok: true, reason: '' };
  }
  return { ok: false, reason: 'did not reach the signed-in home' };
};

const click = async (cdp, label) => {
  if (!label) return;
  await cdp.eval(clickByText(label));
  await sleep(900);
};

const capture = async (cdp, device, screenId) => {
  const measured = await cdp.eval(MEASURE)
    || { overflow: 0, offenders: [], viewport: device.width, scrollWidth: device.width };
  try {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT_DIR, `${device.name}-${screenId}.png`), Buffer.from(shot.data, 'base64'));
  } catch (_) { /* screenshots are a convenience, not the assertion */ }
  return { device, screen: screenId, ...measured, consoleErrors: cdp.drainErrors() };
};

// One device = every screen a user can reach: the auth entry points are
// re-entered by reloading (the session lives in memory), then sign in.
const auditDevice = async (cdp, device) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: device.width,
    height: device.height,
    deviceScaleFactor: 1,
    mobile: device.mobile,
  });
  await sleep(700);

  const rows = [];
  await cdp.send('Page.navigate', { url: APP_URL });
  await sleep(3500);
  rows.push(await capture(cdp, device, 'splash'));

  await click(cdp, 'Get Started');
  rows.push(await capture(cdp, device, 'register'));

  await cdp.send('Page.navigate', { url: APP_URL });
  await sleep(3500);
  await click(cdp, 'I already have an account');
  rows.push(await capture(cdp, device, 'login'));

  if (EMAIL && PASSWORD) {
    const auth = await completeSignIn(cdp);
    if (auth.ok) {
      for (const [index, tab] of TABS.entries()) {
        await click(cdp, tab.tab);
        if (tab.sub) await click(cdp, tab.sub);
        const row = await capture(cdp, device, tab.id);
        // Probe the header once per device (it is identical on every tab),
        // and the rendered text of the screen we came for.
        if (index === 0) row.probe = await cdp.eval(PROBE);
        if (tab.sub) row.text = await cdp.eval(TEXT_PROBE);
        if (tab.id === 'message' || tab.id === 'chat') row.dots = await cdp.eval(DOT_PROBE);
        rows.push(row);
      }
    } else {
      rows.push({ device, screen: 'signin', overflow: -1, offenders: [], consoleErrors: [auth.reason], viewport: device.width, scrollWidth: 0 });
    }
  }
  return rows;
};

const run = async () => {
  const chrome = findChrome();
  if (!chrome) {
    console.error('Chrome not found. Set CHROME_PATH to the browser binary.');
    process.exit(2);
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixlink-chrome-'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--hide-scrollbars',
    APP_URL,
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
    if (!page) throw new Error('No page target from Chrome');

    cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.navigate', { url: APP_URL });
    await sleep(6000);

    const results = [];
    for (const device of DEVICES) {
      try {
        results.push(...await auditDevice(cdp, device));
      } catch (error) {
        results.push({ device, screen: 'crashed', overflow: -1, offenders: [], consoleErrors: [error.message], viewport: device.width, scrollWidth: 0 });
      }
    }

    console.log('\n=== Responsiveness audit ===');
    console.log(`app: ${APP_URL}\nrole: ${ROLE}\nscreenshots: ${OUT_DIR}\n`);
    let bad = 0;
    for (const row of results) {
      const status = row.overflow > 1 ? 'OVERFLOW' : row.overflow === -1 ? 'ERROR' : 'ok';
      if (status !== 'ok') bad += 1;
      console.log(`${status.padEnd(9)} ${String(row.device.name).padEnd(12)} ${String(row.screen).padEnd(8)} viewport=${row.viewport} scroll=${row.scrollWidth} spill=${row.overflow > 0 ? row.overflow : 0}px`);
      if (row.probe) {
        const p = row.probe;
        console.log(`            · greeting="${p.greeting}" serviceArea=${JSON.stringify(p.serviceArea)} avatarLeft=${p.avatarLeft} nameLeft=${p.nameLeft} picLeftOfName=${p.pictureLeftOfName} picAligned=${p.pictureAlignedWithName} nameTruncated=${p.nameTruncated}`);
      }
      if (row.dots) console.log(`            · dots: green=${row.dots.greenDots} grey=${row.dots.greyDots}`);
      if (row.text) console.log(`            · ${row.text}`);
      for (const offender of row.offenders || []) {
        console.log(`            ↳ +${offender.over}px <${offender.tag}> ${offender.text}`);
      }
      for (const line of row.consoleErrors || []) {
        console.log(`            ! console: ${line}`);
      }
    }
    console.log(`\n${results.length} screen/device combinations checked, ${bad} with horizontal spill.`);
    if (bad > 0) process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    browser.kill();
    await sleep(800);
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
};

run().catch((error) => {
  console.error('audit failed:', error.message);
  process.exit(1);
});
