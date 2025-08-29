// api/img.js — Vercel Serverless Function
export default async function handler(req, res) {
  const { gid, p, mode = 'auto', u } = req.query;

  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Referer': 'https://nhentai.net/',
    'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
  };

  async function tryFetch(url) {
    const r = await fetch(url, { headers });
    const ct = r.headers.get('content-type') || '';
    if (!r.ok || !ct.startsWith('image/')) return false;
    const ab = await r.arrayBuffer();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', ct);
    res.send(Buffer.from(ab));
    return true;
  }

  try {
    if (gid && p) {
      const page = Math.max(1, parseInt(p) || 1);

      const api = `https://nhentai.net/api/gallery/${gid}`;
      const ar = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!ar.ok) return res.status(ar.status).send('api ' + ar.status);
      const data = await ar.json();
      const pages = (data.images && data.images.pages) || [];
      if (page > pages.length) return res.status(400).send('bad page');

      const t = (pages[page - 1] && pages[page - 1].t) || 'j'; // j|p|g
      const extMap = { j: 'jpg', p: 'png', g: 'gif' };
      const ext = extMap[t] || 'jpg';
      const media = data.media_id;

      const cand = [];
      for (const host of ['i3.nhentai.net', 'i.nhentai.net']) {
        cand.push(`https://${host}/galleries/${media}/${page}.${ext}`);
      }
      for (const alt of ['jpg', 'png', 'gif']) {
        if (alt !== ext) {
          for (const host of ['i3.nhentai.net', 'i.nhentai.net']) {
            cand.push(`https://${host}/galleries/${media}/${page}.${alt}`);
          }
        }
      }
      cand.push(`https://t.nhentai.net/galleries/${media}/${page}.jpg`);
      cand.push(`https://t.nhentai.net/galleries/${media}/${page}t.jpg`);

      for (const url of cand) {
        if (await tryFetch(url)) return;
      }
      return res.status(502).send('all failed');
    }

    if (u) {
      if (await tryFetch(u)) return;
      return res.status(502).send('fetch failed');
    }

    res.status(400).send('missing params');
  } catch (e) {
    res.status(500).send(String(e));
  }
}
