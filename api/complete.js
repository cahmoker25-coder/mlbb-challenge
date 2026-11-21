// Dipanggil aplikasi utama: terima challenge, selesai (menang/kalah), anggap lunas manual, atau tolak. Butuh ADMIN_KEY.
const L = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    if (!L.isAdmin(req)) return res.status(401).json({ ok: false, error: 'Kunci admin salah' });

    const b = L.getBody(req);
    const action = String(b.action || '');
    const code = String(b.code || '').toUpperCase();
    if (!/^MLBB-[A-Z0-9]{4}$/.test(code)) return res.status(400).json({ ok: false, error: 'Kode tidak valid' });

    const raw = await L.redis(['GET', 'ch:' + code]);
    const ch = raw ? L.parseJSON(raw) : null;
    if (!ch) return res.status(404).json({ ok: false, error: 'Kode tidak ditemukan' });

    if (action === 'accept') {
      if (ch.status === 'paid') { ch.status = 'accepted'; ch.acceptedAt = Date.now(); }
      await L.redis(['LREM', 'queue', '0', code]);
    } else if (action === 'done') {
      ch.status = 'done';
      ch.result = b.result === 'win' ? 'win' : 'loss';
      ch.doneAt = Date.now();
      await L.redis(['LREM', 'queue', '0', code]);
    } else if (action === 'reject') {
      ch.status = 'rejected';
      await L.redis(['LREM', 'queue', '0', code]);
    } else {
      return res.status(400).json({ ok: false, error: 'Aksi tidak dikenal' });
    }

    // selain pending, simpan 30 hari saja
    if (ch.status === 'paid') await L.redis(['SET', 'ch:' + code, JSON.stringify(ch)]);
    else await L.redis(['SET', 'ch:' + code, JSON.stringify(ch), 'EX', '2592000']);

    res.status(200).json({ ok: true, status: ch.status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
