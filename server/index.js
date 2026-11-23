// Máy chủ cho Sổ Cá Nhân: phục vụ app (index.html, sw.js, icons, fonts) và đồng bộ dữ liệu.
// Chạy từ thư mục gốc repo: npm start  (Railway: Root Directory để trống).
//
// Giao thức (khớp với syncNow() trong index.html):
//   POST /sync   Authorization: Bearer <SYNC_TOKEN>
//   body  { device, since, ops: [{ op: 'put'|'del', col, id, data, ts }] }
//   trả   { now, changes: [{ col, id, data, del, ts }] }
// Xung đột: bản có ts (thời điểm sửa trên máy) mới hơn thắng.
//
// Biến môi trường:
//   DATABASE_URL     chuỗi kết nối PostgreSQL (Railway tự cấp khi gắn Postgres)
//   SYNC_TOKEN       mã truy cập, tối thiểu 32 ký tự – bắt buộc
//   ALLOWED_ORIGINS  các địa chỉ app được phép gọi, cách nhau bằng dấu phẩy
//   PORT             cổng (Railway tự cấp)

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { DATABASE_URL, SYNC_TOKEN } = process.env;
const PORT = Number(process.env.PORT) || 8080;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);

const MAX_BODY = 20 * 1024 * 1024;   // 20 MB mỗi lần gửi
const MAX_OPS = 1000;                // app gửi tối đa 500 thay đổi mỗi lần
const FAIL_WINDOW = 15 * 60 * 1000;  // khoá IP sai mã quá nhiều lần trong 15 phút
const FAIL_LIMIT = 20;
const LOCK_KEY = 7310524;            // khoá để các lần đồng bộ chạy lần lượt

if (!DATABASE_URL) fatal('Thiếu DATABASE_URL.');
if (!SYNC_TOKEN || SYNC_TOKEN.length < 32) fatal('SYNC_TOKEN phải có ít nhất 32 ký tự.');
if (!ALLOWED.length) console.warn('[cảnh báo] Chưa đặt ALLOWED_ORIGINS – trang web khác cũng gọi được /sync (vẫn cần đúng mã). App cùng địa chỉ luôn được phép.');

function fatal(msg) { console.error('[lỗi] ' + msg); process.exit(1); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

async function migrate() {
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS docs_rev_seq;
    CREATE TABLE IF NOT EXISTS docs (
      col     text    NOT NULL,
      id      text    NOT NULL,
      data    jsonb,
      del     boolean NOT NULL DEFAULT false,
      ts      bigint  NOT NULL,
      rev     bigint  NOT NULL,
      device  text,
      PRIMARY KEY (col, id)
    );
    CREATE INDEX IF NOT EXISTS docs_rev_idx ON docs (rev);
  `);
}

// ---- Mã truy cập ----
const tokenHash = crypto.createHash('sha256').update(SYNC_TOKEN).digest();
function tokenOk(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const h = crypto.createHash('sha256').update(m[1].trim()).digest();
  return crypto.timingSafeEqual(h, tokenHash);
}

const fails = new Map(); // ip -> { n, until }
function clientIp(req) {
  // Railway đứng trước app như một proxy; phần tử cuối do proxy thêm vào.
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : req.socket.remoteAddress || '?';
}
function blocked(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() > f.until) { fails.delete(ip); return false; }
  return f.n >= FAIL_LIMIT;
}
function noteFail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() > f.until) fails.set(ip, { n: 1, until: Date.now() + FAIL_WINDOW });
  else f.n++;
}
setInterval(() => { const now = Date.now(); for (const [ip, f] of fails) if (now > f.until) fails.delete(ip); }, FAIL_WINDOW).unref();

// ---- Phục vụ app (các tệp ở thư mục gốc repo) ----
// Chỉ nạp đúng các tệp của app vào bộ nhớ khi khởi động; không phục vụ mã server, .git hay tệp khác.
const STATIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_RE = /^(index\.html|sw\.js|manifest\.webmanifest|icons\/[\w.-]+\.png|fonts\/[\w.-]+\.(?:woff2|txt))$/;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const STATIC = new Map(); // '/đường-dẫn' -> { buf, gz, type, etag, cache }
function loadStatic() {
  const walk = (dir, rel = '') => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) { if (ent.name === 'icons' || ent.name === 'fonts') walk(path.join(dir, ent.name), r); continue; }
      if (!STATIC_RE.test(r)) continue;
      const buf = fs.readFileSync(path.join(dir, ent.name));
      const ext = path.extname(r), type = TYPES[ext];
      const compress = ['.html', '.js', '.webmanifest', '.txt'].includes(ext);
      STATIC.set('/' + r, {
        buf, type,
        gz: compress ? zlib.gzipSync(buf, { level: 9 }) : null,
        etag: '"' + crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20) + '"',
        // Trang, sw.js, manifest: luôn hỏi lại để nhận bản mới; icon/font: cho lưu 7 ngày.
        cache: ['.png', '.woff2'].includes(ext) ? 'public, max-age=604800' : 'no-cache',
      });
    }
  };
  if (fs.existsSync(path.join(STATIC_ROOT, 'index.html'))) walk(STATIC_ROOT);
  if (STATIC.has('/index.html')) STATIC.set('/', STATIC.get('/index.html'));
  console.log(STATIC.size ? `Phục vụ app: ${STATIC.size - 1} tệp` : 'Không thấy index.html – chỉ chạy đồng bộ.');
}
loadStatic();

function serveStatic(req, res, p) {
  const f = STATIC.get(p);
  if (!f) return false;
  const headers = {
    'Content-Type': f.type, 'Cache-Control': f.cache, ETag: f.etag,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', Vary: 'Accept-Encoding',
  };
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, headers); res.end(); return true; }
  const gzip = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = gzip ? f.gz : f.buf;
  if (gzip) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

// ---- HTTP ----
function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  // App chạy cùng địa chỉ với server thì luôn được phép.
  let sameHost = false;
  try { sameHost = new URL(origin).host === String(req.headers['x-forwarded-host'] || req.headers.host || ''); } catch { }
  if (sameHost) return true;
  const ok = !ALLOWED.length || ALLOWED.includes(origin.replace(/\/+$/, ''));
  if (!ok) return false;
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.length ? origin : '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Dữ liệu gửi lên quá lớn'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const bad = msg => Object.assign(new Error(msg), { status: 400 });
const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;

function parseSync(raw) {
  let b;
  try { b = JSON.parse(raw); } catch { throw bad('JSON không hợp lệ'); }
  if (!b || typeof b !== 'object') throw bad('Thiếu nội dung');
  const device = typeof b.device === 'string' ? b.device.slice(0, 100) : '';
  const since = Number(b.since) || 0;
  if (!Number.isSafeInteger(since) || since < 0) throw bad('since không hợp lệ');
  const ops = b.ops == null ? [] : b.ops;
  if (!Array.isArray(ops) || ops.length > MAX_OPS) throw bad('ops không hợp lệ');
  // Gộp các thay đổi trùng cùng một mục: giữ bản có ts mới nhất (bằng nhau thì bản gửi sau thắng).
  const latest = new Map();
  for (const o of ops) {
    if (!o || (o.op !== 'put' && o.op !== 'del')) throw bad('op không hợp lệ');
    if (typeof o.col !== 'string' || !NAME_RE.test(o.col)) throw bad('col không hợp lệ');
    if (typeof o.id !== 'string' || !o.id || o.id.length > 200) throw bad('id không hợp lệ');
    const ts = Number(o.ts);
    if (!Number.isSafeInteger(ts) || ts < 0) throw bad('ts không hợp lệ');
    const del = o.op === 'del';
    const item = { col: o.col, id: o.id, del, data: del ? null : (o.data === undefined ? null : o.data), ts };
    const k = o.col + '\u0000' + o.id, cur = latest.get(k);
    if (!cur || ts >= cur.ts) latest.set(k, item);
  }
  return { device, since, ops: [...latest.values()] };
}

async function doSync({ device, since, ops }) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
    let rejected = [];
    if (ops.length) {
      const r = await c.query(`
        WITH incoming AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(col text, id text, data jsonb, del boolean, ts bigint)
        ), written AS (
          INSERT INTO docs (col, id, data, del, ts, rev, device)
          SELECT col, id, data, del, ts, nextval('docs_rev_seq'), $2 FROM incoming
          ON CONFLICT (col, id) DO UPDATE
            SET data = EXCLUDED.data, del = EXCLUDED.del, ts = EXCLUDED.ts, rev = EXCLUDED.rev, device = EXCLUDED.device
            WHERE EXCLUDED.ts >= docs.ts
          RETURNING col, id
        )
        SELECT i.col, i.id FROM incoming i
        WHERE NOT EXISTS (SELECT 1 FROM written w WHERE w.col = i.col AND w.id = i.id)`,
        [JSON.stringify(ops), device]);
      rejected = r.rows; // máy này gửi bản cũ hơn bản trên máy chủ
    }
    // Thay đổi từ máy khác kể từ lần đồng bộ trước, cộng bản mới hơn của các mục vừa bị từ chối.
    const ch = await c.query(`
      SELECT col, id, data, del, ts FROM docs
      WHERE (rev > $1 AND device IS DISTINCT FROM $2)
         OR (col, id) IN (SELECT * FROM jsonb_to_recordset($3::jsonb) AS r(col text, id text))
      ORDER BY rev`,
      [since, device, JSON.stringify(rejected)]);
    const now = (await c.query('SELECT COALESCE(MAX(rev), 0)::bigint AS now FROM docs')).rows[0].now;
    await c.query('COMMIT');
    return {
      now: Number(now),
      changes: ch.rows.map(r => ({ col: r.col, id: r.id, data: r.del ? null : r.data, del: r.del, ts: Number(r.ts) })),
    };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  try {
    // Tệp của app: không cần CORS (trình duyệt tải trực tiếp).
    if ((req.method === 'GET' || req.method === 'HEAD') && serveStatic(req, res, url.pathname)) return;

    if (!cors(req, res)) return send(res, 403, { error: 'Địa chỉ app không được phép' });
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if (req.method === 'GET' && (p === '/health' || (p === '/' && !STATIC.size))) {
      await pool.query('SELECT 1');
      return send(res, 200, { ok: true, service: 'so-ca-nhan-sync' });
    }

    if (req.method === 'POST' && p === '/sync') {
      // Đúng mã thì luôn cho qua; chỉ chặn các lần thử sai, để người dò mã không khoá được chủ thật.
      if (!tokenOk(req)) {
        const ip = clientIp(req);
        if (blocked(ip)) return send(res, 429, { error: 'Sai mã quá nhiều lần, thử lại sau' });
        noteFail(ip);
        return send(res, 401, { error: 'Sai mã truy cập' });
      }
      const input = parseSync(await readBody(req));
      const out = await doSync(input);
      console.log(`sync ${input.device || '?'}: nhận ${input.ops.length}, gửi ${out.changes.length}, now=${out.now}`);
      return send(res, 200, out);
    }

    send(res, 404, { error: 'Không tìm thấy' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[lỗi]', e);
    if (!res.headersSent) send(res, status, { error: status >= 500 ? 'Lỗi máy chủ' : e.message });
  }
});

migrate()
  .then(() => server.listen(PORT, () => console.log(`Máy chủ đồng bộ chạy ở cổng ${PORT}`)))
  .catch(e => { console.error('[lỗi] Không khởi tạo được cơ sở dữ liệu:', e.message); process.exit(1); });

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { server.close(() => pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(0), 8000).unref(); });
}
