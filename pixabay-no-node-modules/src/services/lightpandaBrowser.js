// Browser layer for the Pixabay scraper.
//
// NOTE: upstream this used @lightpanda/browser (lightpanda.serve() + CDP connect),
// but Lightpanda ships NO Windows binary, so on this host we launch headless
// CHROME via puppeteer-core instead. Same CDP surface, same puppeteer Page API —
// the scraping logic (cookie injection, UA, page ops in pixabaySite.js) is
// unchanged. A real Chrome fingerprint also clears Cloudflare more reliably than
// Lightpanda. Set CHROME_PATH / PUPPETEER_EXECUTABLE_PATH to override detection.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const config = require('../config');

/** Serialize page work — keep one page at a time for stability/politeness. */
let cdpTail = Promise.resolve();
let browserInstance = null;
let launchPromise = null;

function findChrome() {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  try {
    const versions = fs.readdirSync(cacheDir)
      .filter((d) => /^(win64|linux|mac)/.test(d))
      .sort()
      .reverse();
    for (const v of versions) {
      for (const sub of ['chrome-win64/chrome.exe', 'chrome-linux64/chrome', 'chrome-mac-x64/chrome']) {
        const p = path.join(cacheDir, v, sub);
        if (fs.existsSync(p)) return p;
      }
    }
  } catch { /* no cache */ }
  for (const p of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  if (!launchPromise) {
    const exe = findChrome();
    if (!exe) throw new Error('no Chrome executable found (set CHROME_PATH or PUPPETEER_EXECUTABLE_PATH)');
    launchPromise = puppeteer
      .launch({
        executablePath: exe,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--window-size=1366,900'],
      })
      .then((b) => {
        browserInstance = b;
        b.on('disconnected', () => { browserInstance = null; launchPromise = null; });
        return b;
      })
      .catch((e) => { launchPromise = null; throw e; });
  }
  return launchPromise;
}

async function resetBrowserConnection() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
    browserInstance = null;
  }
  launchPromise = null;
}

function isTransientCdpError(err) {
  return /TargetAlreadyLoaded|Target closed|Protocol error|createTarget|Connection closed|ECONNRESET|socket hang up|websocket/i.test(
    String(err && err.message ? err.message : err),
  );
}

/**
 * @param {(page: import('puppeteer-core').Page) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function runWithPage(fn) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultNavigationTimeout(config.browser.navigationTimeoutMs);
    await page.setUserAgent(config.browser.userAgent);

    if (config.browser.scrapeBlockHeavyResources) {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const rt = request.resourceType();
        if (rt === 'image' || rt === 'font') {
          request.abort().catch(() => {});
          return;
        }
        request.continue().catch(() => {});
      });
    }

    const cookie = config.browser.cookieHeader.trim();
    if (cookie) {
      const pairs = cookie.split(';').map((s) => s.trim()).filter(Boolean);
      const cookies = pairs.map((pair) => {
        const eq = pair.indexOf('=');
        const name = eq === -1 ? pair : pair.slice(0, eq).trim();
        const value = eq === -1 ? '' : pair.slice(eq + 1).trim();
        return { name, value, domain: '.pixabay.com', path: '/' };
      });
      if (cookies.length) await page.setCookie(...cookies);
    }
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
    const settle = config.browser.cdpSettleMs;
    if (settle > 0) await new Promise((r) => setTimeout(r, settle));
  }
}

/**
 * @param {(page: import('puppeteer-core').Page) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withPage(fn) {
  const max = Math.max(1, config.browser.maxRetries || 3);
  const job = async () => {
    let lastErr;
    for (let attempt = 0; attempt < max; attempt += 1) {
      try {
        return await runWithPage(fn);
      } catch (err) {
        lastErr = err;
        const retry = attempt < max - 1 && isTransientCdpError(err);
        if (retry) {
          await resetBrowserConnection();
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  };
  const p = cdpTail.then(job, job);
  cdpTail = p.then(
    () => {},
    () => {},
  );
  return p;
}

async function shutdown() {
  if (browserInstance) {
    try { await browserInstance.close(); } catch { /* ignore */ }
    browserInstance = null;
    launchPromise = null;
  }
}

module.exports = {
  withPage,
  shutdown,
  getBrowser,
};
