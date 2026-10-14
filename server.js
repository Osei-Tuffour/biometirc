const express = require('express');
const axios = require('axios');
const CryptoJS = require('crypto-js');

const app = express();
app.use(express.urlencoded({ extended: false }));

const TARGET = 'https://lawson12.site.je/atta/biometric_attendance.php';
let cookieCache = { value: null, expires: 0 };

// Solve InfinityFree's slowAES challenge
function solveChallenge(html) {
  const nums = [...html.matchAll(/toNumbers\("([0-9a-f]+)"\)/g)].map(m => m[1]);
  if (nums.length < 3) throw new Error('Challenge format not recognized');
  const key = CryptoJS.enc.Hex.parse(nums[0]);
  const iv  = CryptoJS.enc.Hex.parse(nums[1]);
  const ct  = CryptoJS.enc.Hex.parse(nums[2]);
  const dec = CryptoJS.AES.decrypt(
    { ciphertext: ct }, key,
    { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding }
  );
  return dec.toString(CryptoJS.enc.Hex);
}

async function getCookie() {
  const now = Date.now();
  if (cookieCache.value && cookieCache.expires > now) return cookieCache.value;

  console.log('[relay] fetching challenge...');
  const res = await axios.get(TARGET, {
    maxRedirects: 0,
    validateStatus: s => s >= 200 && s < 400,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ESP32Relay/1.0)' },
    timeout: 15000,
  });

  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  if (!body.includes('slowAES') && !body.includes('__test')) {
    console.log('[relay] no challenge, proceeding without cookie');
    return null;
  }

  const cookie = `__test=${solveChallenge(body)}`;
  cookieCache = { value: cookie, expires: now + 5.5 * 60 * 60 * 1000 };
  console.log('[relay] solved cookie');
  return cookie;
}

async function forward(body) {
  const cookie = await getCookie();
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (compatible; ESP32Relay/1.0)',
  };
  if (cookie) headers['Cookie'] = cookie;

  const res = await axios.post(TARGET, body, { headers, timeout: 15000 });
  const data = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

  // Cookie stale? Solve again and retry once
  if (data.includes('slowAES') || data.includes('__test=')) {
    console.log('[relay] cookie stale, re-solving...');
    cookieCache = { value: null, expires: 0 };
    const fresh = await getCookie();
    const retry = await axios.post(TARGET, body, {
      headers: { ...headers, Cookie: fresh }, timeout: 15000,
    });
    return retry.data;
  }
  return res.data;
}

app.post('/', async (req, res) => {
  try {
    const out = await forward(new URLSearchParams(req.body).toString());
    res.type('application/json').send(out);
  } catch (e) {
    console.error('[relay] error:', e.message);
    res.status(502).json({ success: false, error: 'relay_failed', detail: e.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`[relay] listening on ${PORT}`));
