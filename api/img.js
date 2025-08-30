// /api/img.js  (Vercel / Next.js API Route)
export default async function handler(req, res) {
  try {
    const { gid, p, mode, u, info } = req.query;

    // Общее: аккуратные заголовки, чтобы нас не резали
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Referer": "https://nhentai.net/",
      "Accept": "*/*",
    };

    // ====== META (info=1) ====================================================
    if (info) {
      if (!gid) {
        res.status(400).json({ error: "gid is required" });
        return;
      }

      // Берём JSON у самого nhentai
      const apiUrl = `https://nhentai.net/api/gallery/${gid}`;
      const r = await fetch(apiUrl, { headers });
      if (!r.ok) {
        res.status(r.status).json({ error: `nhentai api ${r.status}` });
        return;
      }
      const j = await r.json();

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
      res.status(200).json({ gid, title, pages, artists, parodies, tags });
      return;
    }
    // ====== /META ============================================================

    // ----- НИЖЕ остаётся твоя логика раздачи картинок -----
    // Если у тебя уже был рабочий код для p / mode / u — оставь его.
    // Простейший пример-заглушка (ничего не делает), чтобы файл был самодостаточным:
    res.status(400).json({ error: "no image mode implemented here" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
