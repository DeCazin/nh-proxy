// Vercel Node.js Serverless Function
// Обрабатывает:
//   - ?info=1                     -> JSON метаданных
//   - ?gid=<id>&p=<num>           -> оригинальная страница
//   - ?gid=<id>&p=<num>&mode=thumb-> миниатюра страницы
//   - ?u=<direct-url>             -> проксирование произвольного URL
//   - ?diag=1                     -> отладочный JSON попыток

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const BASE_HEADERS = {
  "User-Agent": UA,
  "Referer": "https://nhentai.net/",
  "Accept": "*/*",
};

// сопоставление буквы типа картинки в API к расширению
const TYPE_TO_EXT = { j: "jpg", p: "png", g: "gif", w: "webp" };

// ---------------------------------------------------------------------------
// helpers
async function fetchJson(url) {
  const r = await fetch(url, { headers: BASE_HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return await r.json();
}

function buildOriginalUrls(mediaId, p, ext) {
  const hosts = ["i", "i3", "i7"];
  const urls = [];
  for (const h of hosts) {
    urls.push(`https://${h}.nhentai.net/galleries/${mediaId}/${p}.${ext}`);
  }
  return urls;
}

function buildThumbUrls(mediaId, p, exts = ["jpg", "webp", "png", "gif"]) {
  // у нхентай превью обычно jpg, но бывает webp — пробуем несколько
  const thosts = ["t", "t3"];
  const urls = [];
  for (const h of thosts) {
    for (const e of exts) {
      urls.push(`https://${h}.nhentai.net/galleries/${mediaId}/${p}t.${e}`);
    }
  }
  return urls;
}

async function tryFetchFirst(urls, diag) {
  const attempts = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: BASE_HEADERS });
      const ct = r.headers.get("content-type") || "";
      attempts.push({ url: u, status: r.status, ct });
      if (r.ok && ct.startsWith("image/")) {
        const buf = Buffer.from(await r.arrayBuffer());
        return { ok: true, url: u, status: r.status, ct, body: buf, diag: attempts };
      }
    } catch (e) {
      attempts.push({ url: u, error: String(e) });
    }
  }
  return { ok: false, diag: attempts };
}

// ---------------------------------------------------------------------------
// handler
export default async function handler(req, res) {
  try {
    const { gid, p, mode, u, info, diag } = req.query;

    // ---------------- META ----------------
    if (info) {
      if (!gid) return res.status(400).json({ error: "gid is required" });
      const apiUrl = `https://nhentai.net/api/gallery/${gid}`;
      const j = await fetchJson(apiUrl);

      const title =
        (j.title && (j.title.english || j.title.pretty || j.title.japanese)) ||
        j.title ||
        null;

      const pages =
        (j.images && Array.isArray(j.images.pages) && j.images.pages.length) ||
        j.num_pages ||
        null;

      const pick = (type) =>
        (j.tags || [])
          .filter((t) => t && t.type === type)
          .map((t) => t.name)
          .filter(Boolean);

      const artists = pick("artist");
      const parodies = pick("parody");
      const tags = pick("tag");

      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
      return res.status(200).json({
        gid,
        title,
        pages,
        artists,
        parodies,
        tags,
        media_id: j.media_id,
      });
    }

    // ------------ прямой URL -------------
    if (u) {
      const r = await fetch(u, { headers: BASE_HEADERS });
      const ct = r.headers.get("content-type") || "application/octet-stream";
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
      return res.status(r.status).send(buf);
    }

    // ------------ изображение ------------
    if (!gid || !p) {
      return res
        .status(400)
        .json({ error: "gid and p are required (or use info=1/u=)" });
    }

    // берём JSON, чтобы знать media_id и тип страницы (расширение)
    const j = await fetchJson(`https://nhentai.net/api/gallery/${gid}`);
    const mediaId = j.media_id;

    // p — 1..N
    const pageIndex = Math.max(1, parseInt(p, 10)) - 1;
    const tLetter =
      j?.images?.pages?.[pageIndex]?.t || "j"; // j/p/g/w, по умолчанию jpg
    const ext = TYPE_TO_EXT[tLetter] || "jpg";

    let urls = [];
    if (mode === "thumb") {
      urls = buildThumbUrls(mediaId, parseInt(p, 10));
    } else {
      urls = buildOriginalUrls(mediaId, parseInt(p, 10), ext);
    }

    const result = await tryFetchFirst(urls, !!diag);
    if (!result.ok) {
      if (diag) return res.status(404).json({ ok: false, attempts: result.diag });
      return res.status(404).send("not found");
    }

    res.setHeader("Content-Type", result.ct || "image/jpeg");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    if (diag) res.setHeader("X-Used-Url", result.url);
    return res.status(200).send(result.body);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
