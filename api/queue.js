// Dipanggil aplikasi utama (index.html) untuk mengambil antrean + notifikasi. Butuh ADMIN_KEY.
const L = require('./_lib');

async function loadChallenges(codes) {
  if (!codes.length) return [];
  const raws = await L.redis(['MGET', ...codes.map(c => 'ch:' + c)]);
  return raws.map(r => (r ? L.parseJSON(r) : null)).filter(Boolean);
}

module.exports = async (req, res) => {
  try {
    if (!L.isAdmin(req)) return res.status(401).json({ ok: false, error: 'Kunci admin salah' });

    const codes = (await L.redis(['LRANGE', 'queue', '0', '-1'])) || [];
    const queue = (await loadChallenges([...new Set(codes)])).filter(c => c.status === 'paid')
      .sort((a, b) => (a.paidAt || 0) - (b.paidAt || 0));

    const pendCodes = (await L.redis(['LRANGE', 'pendinglist', '0', '29'])) || [];
    const pending = (await loadChallenges([...new Set(pendCodes)])).filter(c => c.status === 'pending');

    const notifs = ((await L.redis(['LRANGE', 'notifs', '0', '49'])) || []).map(L.parseJSON).filter(Boolean);

    const out = { ok: true, now: Date.now(), queue, pending, notifs };
    if (req.query && req.query.debug) {
      out.webhookLog = ((await L.redis(['LRANGE', 'webhook:log', '0', '9'])) || []).map(L.parseJSON).filter(Boolean);
    }
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
