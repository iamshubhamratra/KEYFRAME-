const express = require('express');
const { withPage } = require('../services/lightpandaBrowser');
const pixabay = require('../services/pixabaySite');
const { fetchBinary } = require('../fetchRemote');

const router = express.Router();

function automationHint(err) {
  const m = String(err instanceof Error ? err.message : err);
  if (/TargetAlreadyLoaded|createTarget|Protocol error|Target closed|websocket/i.test(m)) {
    return 'Transient browser/CDP error: retry the request, run a single npm start, or raise BROWSER_MAX_RETRIES.';
  }
  if (/setRequestInterception|Request is already handled|interception/i.test(m)) {
    return 'Leave SCRAPE_BLOCK_HEAVY unset (default off). Enable only if stable on your machine.';
  }
  if (/Navigation timeout|timeout/i.test(m)) {
    return 'Try NAVIGATION_TIMEOUT_MS=90000 or ensure PIXABAY_COOKIE + PIXABAY_USER_AGENT match a real browser session.';
  }
  return undefined;
}

/** @type {import('../services/pixabaySite').AssetCategory[]} */
const CATEGORIES = ['vectors', 'videos', 'music', 'sound-effects'];

function parseCategory(p) {
  if (CATEGORIES.includes(p)) return /** @type {import('../services/pixabaySite').AssetCategory} */ (p);
  return null;
}

function sendInvalidCategory(res, received) {
  res.status(400).json({
    error: 'invalid_category',
    message: 'Use one of the allowed path prefixes for {category} (see allowed).',
    received,
    allowed: CATEGORIES,
  });
}

function sendInvalidId(res, received) {
  res.status(400).json({
    error: 'invalid_id',
    message: 'Asset id must include at least one digit (Pixabay numeric media id).',
    received,
  });
}

function searchHandler(category) {
  return async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const page = Number(req.query.page) || 1;
    try {
      const data = await withPage((pg) => pixabay.searchWithNetwork(pg, category, { q, page }));
      res.json({
        category,
        query: q,
        page,
        sourceUrl: data.url,
        pageTitle: data.pageTitle,
        cloudflareChallengeLikely: data.challengeLikely,
        jsonSourcesSample: data.jsonSources.slice(0, 12),
        items: data.items,
      });
    } catch (err) {
      const hint = automationHint(err);
      res.status(502).json({
        error: 'pixabay_browser_failed',
        message: err instanceof Error ? err.message : String(err),
        ...(hint ? { hint } : {}),
      });
    }
  };
}

router.get('/vectors/search', searchHandler('vectors'));
router.get('/videos/search', searchHandler('videos'));
router.get('/music/search', searchHandler('music'));
router.get('/sound-effects/search', searchHandler('sound-effects'));

// Resolve a direct, downloadable mp3 URL for the first (or Nth) track matching a
// query — Pixabay audio URLs are lazy (play-triggered), so this drives a play
// click and captures the audio response. Returns { mp3Url } for the caller to
// fetch directly (the CDN url is public). music | sound-effects only.
router.get('/:category/first-audio', async (req, res) => {
  const category = parseCategory(req.params.category);
  if (category !== 'music' && category !== 'sound-effects') {
    return res.status(400).json({
      error: 'invalid_category',
      message: 'first-audio supports music | sound-effects only.',
      allowed: ['music', 'sound-effects'],
      received: req.params.category,
    });
  }
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const index = Number(req.query.index) || 0;
  try {
    const data = await withPage((pg) => pixabay.resolveFirstAudio(pg, category, { q, index }));
    res.json({ category, query: q, index, ...data });
  } catch (err) {
    const hint = automationHint(err);
    res.status(502).json({
      error: 'pixabay_browser_failed',
      message: err instanceof Error ? err.message : String(err),
      ...(hint ? { hint } : {}),
    });
  }
});

router.get('/:category/assets/:id/download-info', async (req, res) => {
  const category = parseCategory(req.params.category);
  if (!category) return sendInvalidCategory(res, req.params.category);
  const rawId = String(req.params.id ?? '');
  const id = rawId.replace(/\D/g, '');
  if (!id) return sendInvalidId(res, rawId);
  try {
    const info = await withPage((pg) => pixabay.resolveDownloadUrl(pg, category, id));
    res.json({
      category,
      id,
      detailUrl: info.detailUrl,
      pageTitle: info.pageTitle,
      candidates: info.candidates,
    });
  } catch (err) {
    const hint = automationHint(err);
    res.status(502).json({
      error: 'pixabay_browser_failed',
      message: err instanceof Error ? err.message : String(err),
      ...(hint ? { hint } : {}),
    });
  }
});

router.get('/:category/assets/:id/file', async (req, res) => {
  const category = parseCategory(req.params.category);
  if (!category) return sendInvalidCategory(res, req.params.category);
  const rawId = String(req.params.id ?? '');
  const id = rawId.replace(/\D/g, '');
  if (!id) return sendInvalidId(res, rawId);
  const explicit = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  let target = explicit;
  if (!target) {
    try {
      const info = await withPage((pg) => pixabay.resolveDownloadUrl(pg, category, id));
      const best =
        info.candidates.find((c) => /octet-stream|audio\/|video\/|svg/i.test(c.contentType)) || info.candidates[0];
      target = best?.url || '';
    } catch (err) {
      const hint = automationHint(err);
      return res.status(502).json({
        error: 'pixabay_browser_failed',
        message: err instanceof Error ? err.message : String(err),
        ...(hint ? { hint } : {}),
      });
    }
  }
  if (!target) return res.status(404).json({ error: 'no_download_url', hint: 'Try /download-info or pass ?url=' });
  const ac = new AbortController();
  const onClose = () => ac.abort();
  res.on('close', onClose);
  try {
    const { buf, contentType, contentDisposition } = await fetchBinary(target, ac.signal);
    res.setHeader('Content-Type', contentType);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
    res.send(buf);
  } catch (err) {
    const status = /** @type {any} */ (err).status === 403 ? 403 : 502;
    res.status(status).json({
      error: 'upstream_fetch_failed',
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    res.off('close', onClose);
  }
});

module.exports = router;
