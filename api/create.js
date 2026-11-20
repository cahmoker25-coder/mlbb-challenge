// Dipanggil form viewer (kirim.html). Menyimpan challenge dengan status "pending" dan membuat kode unik.
const L = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metode tidak diizinkan' });

    // batasi spam: 1 kiriman per 15 detik per alamat IP
    const rl = await L.redis(['SET', 'rl:' + L.clientIp(req), '1', 'NX', 'EX', '15']);
    if (rl === null) return res.status(429).json({ ok: false, error: 'Terlalu cepat. Coba lagi beberapa detik lagi.' });

    const b = L.getBody(req);
    const name = L.cleanText(b.name, 28);
    const message = L.cleanText(b.message, 220);
    const mode = L.cleanText(b.mode, 12);
    const lane = L.cleanText(b.lane, 12);
    const hero = L.cleanText(b.hero, 30);
    const lose = L.cleanText(b.lose, 120);
    const cara = (Array.isArray(b.cara) ? b.cara : []).map(x => L.cleanText(x, 120));

    if (!name || !message) return res.status(400).json({ ok: false, error: 'Nama dan pesan wajib diisi.' });
    if (!L.MODES.includes(mode)) return res.status(400).json({ ok: false, error: 'Mode tidak valid.' });
    if (!L.LANES.includes(lane)) return res.status(400).json({ ok: false, error: 'Lane tidak valid.' });
    if (!L.HEROES.includes(hero)) return res.status(400).json({ ok: false, error: 'Hero tidak valid.' });
    if (cara.length !== 5 || cara.some(x => !x)) return res.status(400).json({ ok: false, error: 'Isi semua 5 kolom Cara Main.' });
    if (!lose) return res.status(400).json({ ok: false, error: 'Kolom Kalau Kalah wajib diisi.' });

    const ch = { status: 'pending', name, message, mode, lane, hero, cara, lose, createdAt: Date.now() };
    let code = null;
    for (let i = 0; i < 8 && !code; i++) {
      const bytes = L.crypto.randomBytes(4);
      let c = 'MLBB-';
      for (let k = 0; k < 4; k++) c += L.CODE_ALPHABET[bytes[k] % L.CODE_ALPHABET.length];
      ch.code = c;
      // pending hanya berlaku 48 jam
      const ok = await L.redis(['SET', 'ch:' + c, JSON.stringify(ch), 'NX', 'EX', '172800']);
      if (ok === 'OK') code = c;
    }
    if (!code) return res.status(500).json({ ok: false, error: 'Gagal membuat kode. Coba lagi.' });

    await L.redis(['LPUSH', 'pendinglist', code]);
    await L.redis(['LTRIM', 'pendinglist', '0', '49']);

    res.status(200).json({
      ok: true,
      code,
      donasiUrl: process.env.DONASI_URL || '',
      min: Number(process.env.MIN_DONASI || 0),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Server error: ' + e.message });
  }
};
