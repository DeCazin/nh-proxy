export default async function handler(req, res) {
  const { gid, p, mode = 'auto', u, debug } = req.query;

  const headers = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://nhentai.net/",
    "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
  };

  async function tryFetch(url) {
    const r = await fetch(url, { headers });
    const ct = r.headers.get("content-type") || "";
    const ok = r.ok && /^image\//i.test(ct);
    const status = r.status;
    let buf = null;
    if (ok) {
      const ab = await r.arrayBuffer();
      buf = Buffer.from(ab);
    }
    return { ok, status, ct, buf };
  }

  const ihosts = ["i3.nhentai.net","i7.nhentai.net","i4.nhentai.net","i6.nhentai.net","i2.nhentai.net","i.nhentai.net"];
  const thosts = ["t3.nhentai.net","t7.nhentai.net","t.nhentai.net"];
  const extsAll = ["jpg","png","gif","webp"];

  try {
    if (gid && p) {
      const page = Math.max(1, parseInt(p) || 1);
      const api = `https://nhentai.net/api/gallery/${gid}`;
      const ar = await fetch(api, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!ar.ok) return res.status(ar.status).send("api " + ar.status);
      const data = await ar.json();
      const pages = (data.images && data.images.pages) || [];
      if (page > pages.length) return res.status(400).send("bad page");

      const t = (pages[page - 1] && pages[page - 1].t) || "j";
      const extMap = { j: "jpg", p: "png", g: "gif" };
      const primaryExt = extMap[t] || "jpg";
      const media = data.media_id;

      const tried = [];
      if (mode !== "thumb") {
        for (const h of ihosts) {
          tried.push({ type:"orig", url:`https://${h}/galleries/${media}/${page}.${primaryExt}` });
          for (const e of extsAll) if (e !== primaryExt)
            tried.push({ type:"orig", url:`https://${h}/galleries/${media}/${page}.${e}` });
        }
      }
      if (mode !== "orig") {
        for (const h of thosts) {
          tried.push({ type:"thumb", url:`https://${h}/galleries/${media}/${page}.jpg` });
          tried.push({ type:"thumb", url:`https://${h}/galleries/${media}/${page}t.jpg` });
        }
      }

      const diag = [];
      for (const c of tried) {
        const r = await tryFetch(c.url);
        diag.push({ url:c.url, status:r.status, ct:r.ct, ok:r.ok });
        if (r.ok) {
          if (debug) return res.status(200).json({ ok:true, picked:c.url, diag });
          res.setHeader("Access-Control-Allow-Origin","*");
          res.setHeader("Content-Type", r.ct);
          return res.send(r.buf);
        }
      }
      if (debug) return res.status(502).json({ ok:false, reason:"all failed", diag });
      return res.status(502).send("all failed");
    }

    if (u) {
      const r = await tryFetch(u);
      if (r.ok) {
        res.setHeader("Access-Control-Allow-Origin","*");
        res.setHeader("Content-Type", r.ct);
        return res.send(r.buf);
      }
      return res.status(r.status || 502).send("fetch failed");
    }

    res.status(400).send("missing params");
  } catch (e) {
    res.status(500).send(String(e));
  }
}
