// Fungsi bantu yang dipakai semua file di folder api.
// Awalan "_" membuat Vercel TIDAK menjadikan file ini sebagai alamat publik.
const crypto = require('crypto');

const HEROES = ["Aamon","Akai","Aldous","Alice","Alpha","Alucard","Angela","Argus","Arlott","Atlas","Aulus","Aurora","Badang","Balmond","Bane","Barats","Baxia","Beatrix","Belerick","Benedetta","Brody","Bruno","Carmilla","Cecilion","Chang'e","Chip","Chou","Cici","Claude","Clint","Cyclops","Diggie","Dyrroth","Edith","Esmeralda","Estes","Eudora","Fanny","Faramis","Floryn","Franco","Fredrinn","Freya","Gatotkaca","Gloo","Gord","Granger","Grock","Guinevere","Gusion","Hanabi","Hanzo","Harith","Harley","Hayabusa","Helcurt","Hilda","Hirara","Hylos","Irithel","Ixia","Jawhead","Johnson","Joy","Julian","Kadita","Kagura","Kaja","Kalea","Karina","Karrie","Khaleed","Khufra","Kimmy","Lancelot","Lapu-Lapu","Layla","Leomord","Lesley","Ling","Lolita","Lukas","Lunox","Luo Yi","Lylia","Marcel","Martis","Masha","Mathilda","Melissa","Minotaur","Minsitthar","Miya","Moskov","Nana","Natalia","Natan","Nolan","Novaria","Obsidia","Odette","Paquito","Pharsa","Phoveus","Popol and Kupa","Rafaela","Roger","Ruby","Saber","Selena","Silvanna","Sora","Sun","Suyou","Terizla","Thamuz","Tigreal","Uranus","Vale","Valentina","Valir","Vexana","Wanwan","X.Borg","Xavier","Yi Sun-shin","Yin","Yve","Yu Zhong","Zetian","Zhask","Zhuxin","Zilong"];
const MODES = ['RANKED', 'CLASSIC'];
const LANES = ['ROAM', 'JUNGLE', 'EXP LANE', 'GOLD LANE', 'MID LANE'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

async function redis(cmd) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN belum diisi di Vercel');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length || x.length === 0) return false;
  return crypto.timingSafeEqual(x, y);
}

function isAdmin(req) {
  const key = process.env.ADMIN_KEY;
  return !!key && safeEqual(req.headers['x-admin-key'], key);
}

function getBody(req) {
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch (e) {}
    try { return Object.fromEntries(new URLSearchParams(b)); } catch (e) {}
    return {};
  }
  return b && typeof b === 'object' ? b : {};
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
}

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseJSON(s) { try { return JSON.parse(s); } catch (e) { return null; } }

module.exports = { HEROES, MODES, LANES, CODE_ALPHABET, redis, safeEqual, isAdmin, getBody, clientIp, cleanText, parseJSON, crypto };
