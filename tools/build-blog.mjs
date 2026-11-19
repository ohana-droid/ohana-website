// microCMS のブログ記事から blog.html と blog/<記事ID>.html を作るスクリプト
// 実行: MICROCMS_SERVICE_DOMAIN=xxx MICROCMS_API_KEY=yyy node tools/build-blog.mjs
// テスト用: BLOG_MOCK=tools/mock-posts.json node tools/build-blog.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'node:fs';

const MAX_PHOTOS = 10;
const ROOT = new URL('..', import.meta.url).pathname;

async function loadPosts() {
  if (process.env.BLOG_MOCK) return JSON.parse(readFileSync(process.env.BLOG_MOCK, 'utf8')).contents;
  const domain = process.env.MICROCMS_SERVICE_DOMAIN, key = process.env.MICROCMS_API_KEY;
  if (!domain || !key) { console.log('microCMS の設定がないため、ブログは更新しません'); process.exit(0); }
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`https://${domain}.microcms.io/api/v1/blog?limit=100&offset=${offset}&orders=-publishedAt`, { headers: { 'X-MICROCMS-API-KEY': key } });
    if (!res.ok) throw new Error(`microCMS API error ${res.status}: ${await res.text()}`);
    const j = await res.json();
    all.push(...j.contents);
    if (all.length >= j.totalCount) break;
  }
  return all;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; };
const img = (url, w) => `${url}?w=${w}&fm=webp&q=80`;
const paras = text => String(text ?? '').trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
const plain = (text, n) => { const t = String(text ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

function normalize(p) {
  const photos = (p.photos || []).slice(0, MAX_PHOTOS);
  const sel = Array.isArray(p.cover) ? p.cover[0] : p.cover;
  const n = parseInt(String(sel ?? '').replace(/[０-９]/g, d => '０１２３４５６７８９'.indexOf(d)), 10);
  const cover = photos[(n >= 1 && n <= photos.length) ? n - 1 : 0] || null;
  return { id: p.id, title: p.title, author: p.author, body: p.body, date: p.publishedAt || p.createdAt, photos, cover };
}

// 会社概要ページを型にして、ヘッダー・フッターを共通にする
const base = readFileSync(ROOT + 'company.html', 'utf8');
function page({ title, desc, main, depth, ogImage }) {
  const pre = depth ? '../' : '';
  let html = base
    .replace(/<main>[\s\S]*<\/main>/, `<main>\n${main}\n</main>`)
    .replace(/<title>.*?<\/title>/, `<title>${esc(title)}｜ヘルパーステーションohana</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}｜ヘルパーステーションohana`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/ aria-current="page"/g, '')
    .replace(/<a href="blog\.html">ブログ<\/a>/, '<a href="blog.html" aria-current="page">ブログ</a>');
  if (ogImage) html = html.replace(/(<meta property="og:image" content=")[^"]*/, `$1${ogImage}`);
  if (pre) html = html.replace(/(href|src)="(?!https?:|#|\/|mailto:|tel:)([^"]+)"/g, `$1="${pre}$2"`);
  return html;
}

const posts = (await loadPosts()).map(normalize).sort((a, b) => new Date(b.date) - new Date(a.date));

// 一覧
const cards = posts.map(p => `      <li><a class="blog-card" href="blog/${esc(p.id)}.html">
        <span class="blog-thumb">${p.cover ? `<img src="${img(p.cover.url, 640)}" alt="" loading="lazy">` : ''}</span>
        <span class="blog-meta"><time datetime="${esc(p.date)}">${fmtDate(p.date)}</time></span>
        <b>${esc(p.title)}</b>
        <span class="blog-excerpt">${esc(plain(p.body, 60))}</span>
      </a></li>`).join('\n');
const listMain = `  <div class="wrap">
    <div class="page-head"><p class="crumb"><a href="index.html">HOME</a><span aria-hidden="true">›</span>ブログ</p><h1>ブログ</h1></div>
    <div class="sub">
${posts.length ? `    <ul class="blog-list">\n${cards}\n    </ul>` : '    <p class="blog-empty">まだ記事はありません。</p>'}
    </div>
  </div>`;
writeFileSync(ROOT + 'blog.html', page({ title: 'ブログ', desc: 'ヘルパーステーションohanaの日々の様子をお届けします。', main: listMain, depth: 0 }));

// 記事
mkdirSync(ROOT + 'blog', { recursive: true });
const keep = new Set();
for (const p of posts) {
  const gallery = p.photos.length > 1 ? `      <ul class="blog-gallery">\n${p.photos.map((ph, i) => `        <li><a href="${img(ph.url, 1600)}" target="_blank" rel="noopener"><img src="${img(ph.url, 480)}" alt="写真${i + 1}" loading="lazy"></a></li>`).join('\n')}\n      </ul>` : '';
  const main = `  <div class="wrap">
    <div class="page-head"><p class="crumb"><a href="index.html">HOME</a><span aria-hidden="true">›</span><a href="blog.html">ブログ</a><span aria-hidden="true">›</span>${esc(p.title)}</p><h1>${esc(p.title)}</h1>
      <p class="blog-meta"><time datetime="${esc(p.date)}">${fmtDate(p.date)}</time>${p.author ? `<span>${esc(p.author)}</span>` : ''}</p></div>
    <article class="sub narrow blog-article">
${p.cover ? `      <img class="blog-cover" src="${img(p.cover.url, 1200)}" alt="">` : ''}
      <div class="blog-body">
${paras(p.body)}
      </div>
${gallery}
      <p class="blog-back"><a href="blog.html">← ブログ一覧へ戻る</a></p>
    </article>
  </div>`;
  const file = `${p.id}.html`; keep.add(file);
  writeFileSync(ROOT + 'blog/' + file, page({ title: p.title, desc: plain(p.body, 100), main, depth: 1, ogImage: p.cover ? img(p.cover.url, 1200) : null }));
}
// 削除された記事のページを消す
for (const f of readdirSync(ROOT + 'blog')) if (f.endsWith('.html') && !keep.has(f)) unlinkSync(ROOT + 'blog/' + f);
console.log(`ブログ: ${posts.length}件`);
