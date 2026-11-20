// Dipanggil oleh Sociabuzz setiap ada donasi.
// Alamat yang dipasang di Sociabuzz:  https://ALAMAT-VERCEL/api/webhook
// (kalau Sociabuzz tidak mengirim token di header, pakai: https://ALAMAT-VERCEL/api/webhook?token=SOCIABUZZ_TOKEN)
const L = require('./_lib');

// cari nilai pertama yang namanya cocok (urut prioritas), termasuk di dalam objek bersarang
function deepFind(obj, keys) {
  const flat = [];
  (function walk(o, depth) {
    if (!o || typeof o !== 'object' || depth > 4) return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v !== null && typeof v === 'object') walk(v, depth + 1);
      else flat.push([k.toLowerCase().replace(/[^a-z0-9]/g, ''), v, depth]);
    }
  })(obj, 0);
  for (const want of keys) {
    const hit = flat.filter(f => f[0] === want && f[1] !== '' && f[1] != null).sort((a, b) => a[2] - b[2])[0];
    if (hit) return hit[1];
  }
  return null;
}

function toAmount(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (/[.,]\d{3}(?!\d)/.test(s)) s = s.replace(/[.,]/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? Math.round(n) : null;
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') return res.status(200).send('Webhook MLBB aktif.');
    if (req.method !== 'POST') return res.status(405).end();

    const secret = process.env.SOCIABUZZ_TOKEN;
    if (!secret) return res.status(500).json({ success: false, error: 'SOCIABUZZ_TOKEN belum diisi di Vercel' });

    const body = L.getBody(req);

    // token boleh ada di: header apa saja, ?token=, atau isi pesan (token / webhook_token / secret)
    const cands = [];
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v !== 'string') continue;
      if (['host', 'user-agent', 'content-type', 'content-length', 'accept', 'accept-encoding', 'connection'].includes(k)) continue;
      cands.push(v, v.replace(/^Bearer\s+/i, ''));
    }
    const q = req.query || {};
    cands.push(q.token, q.key);
    for (const k of ['token', 'webhook_token', 'webhooktoken', 'secret', 'verify_token', 'verification_token']) cands.push(body[k]);
    const authed = cands.some(c => L.safeEqual(c, secret));

    const rawText = JSON.stringify(body);
    const logEntry = {
      at: Date.now(),
      ok: authed,
      headers: Object.keys(req.headers).filter(h => !h.startsWith('x-vercel') && !h.startsWith('x-forwarded')),
      body: rawText.length > 1500 ? rawText.slice(0, 1500) + '…' : rawText,
    };
    // simpan 10 pesan terakhir untuk diagnosa (tanpa isi token header)
    await L.redis(['LPUSH', 'webhook:log', JSON.stringify(logEntry)]);
    await L.redis(['LTRIM', 'webhook:log', '0', '9']);

    if (!authed) return res.status(401).json({ success: false, error: 'Token salah' });

    // cegah donasi yang sama terproses dua kali kalau Sociabuzz mengirim ulang
    const hash = L.crypto.createHash('sha256').update(rawText).digest('hex').slice(0, 32);
    const first = await L.redis(['SET', 'seen:' + hash, '1', 'NX', 'EX', '600']);
    if (first === null) return res.status(200).json({ success: true, status: 'duplicate' });

    const name = L.cleanText(deepFind(body, ['supportername', 'donatorname', 'donorname', 'donatur', 'supporter', 'donor', 'fromname', 'sender', 'nama', 'name']) || 'Anonim', 40);
    const message = L.cleanText(deepFind(body, ['supportermessage', 'donationmessage', 'message', 'note', 'notes', 'comment', 'pesan', 'text']) || '', 300);
    const amount = toAmount(deepFind(body, ['amount', 'totalamount', 'amounttotal', 'grossamount', 'donationamount', 'nominal', 'total', 'price', 'value']));

    // cari kode MLBB-XXXX di pesan (atau di mana saja di isi data)
    const m = (message + ' ' + rawText).toUpperCase().match(/MLBB[\s-]?([A-Z0-9]{4})/);
    const code = m ? 'MLBB-' + m[1] : null;

    const min = Number(process.env.MIN_DONASI || 0);
    let status = 'tanpa_kode';

    if (code) {
      const raw = await L.redis(['GET', 'ch:' + code]);
      const ch = raw ? L.parseJSON(raw) : null;
      if (!ch) status = 'kode_tidak_ditemukan';
      else if (ch.status !== 'pending') status = 'kode_sudah_dipakai';
      else if (min > 0 && amount === null) status = 'jumlah_tidak_terbaca';
      else if (min > 0 && amount < min) status = 'donasi_kurang';
      else {
        ch.status = 'paid';
        ch.paidAt = Date.now();
        ch.donor = { name, amount, message };
        await L.redis(['SET', 'ch:' + code, JSON.stringify(ch)]); // tanpa kedaluwarsa
        await L.redis(['LPUSH', 'queue', code]);
        status = 'cocok';
      }
    }

    const notif = { id: hash, name, message, amount, at: Date.now(), code, status };
    await L.redis(['LPUSH', 'notifs', JSON.stringify(notif)]);
    await L.redis(['LTRIM', 'notifs', '0', '99']);

    res.status(200).json({ success: true, status: 'ok' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
