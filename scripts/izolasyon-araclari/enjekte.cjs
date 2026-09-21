/**
 * IZOLASYON ENJEKSIYONU — YALNIZ matris surecinin Supabase okumasini degistirir
 * (`node --require`). Veritabanina YAZMA YOK; sunucu gercek veriyi servis eder.
 * Korlesme testleri (korlesme.mjs) hedef secimini ve sahiplik haritasini
 * boyle sinar: "veri su sekilde degisseydi matris ne derdi?"
 *
 * IZOLASYON_ENJEKTE = JSON dizi; her islem bir tabloya (ya da "*" = icerik
 * tablolarinin hepsine) uygulanir:
 *   {"tablo":"news","islem":"basa","id":"<uuid>"}                       satiri basa al
 *   {"tablo":"headlines","islem":"cikar","id":"<uuid>"}                 satiri cikar
 *   {"tablo":"news","islem":"kurum","id":"<uuid>","kurum":"<uuid>"}     tenant_id'yi degistir + basa al
 *   {"tablo":"*","islem":"kurum-cikar","kurum":"<uuid>"}                o kurumun tum icerik satirlarini cikar
 * Bulunamayan satir HATA (sessiz gecis yok).
 */
const islemler = JSON.parse(process.env.IZOLASYON_ENJEKTE || "[]");
const ICERIK_TABLOLARI = ["news", "announcements", "pages", "headlines"];
const asil = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const url = typeof input === "string" ? input : input && input.url;
  const r = await asil.apply(this, arguments);
  const tablo = url && (url.match(/\/rest\/v1\/([a-z_]+)\?/) || [])[1];
  const ilgili = islemler.filter((o) => o.tablo === tablo || (o.tablo === "*" && ICERIK_TABLOLARI.includes(tablo)));
  if (!ilgili.length) return r;
  let j = await r.clone().json();
  if (!Array.isArray(j)) return r;
  for (const o of ilgili) {
    const i = o.id ? j.findIndex((x) => x.id === o.id) : -1;
    if (["basa", "kurum", "cikar"].includes(o.islem) && i < 0) throw new Error(`enjekte: ${tablo} satiri yok (${o.id})`);
    if (o.islem === "basa") j = [j[i], ...j.slice(0, i), ...j.slice(i + 1)];
    else if (o.islem === "kurum") j = [{ ...j[i], tenant_id: o.kurum }, ...j.slice(0, i), ...j.slice(i + 1)];
    else if (o.islem === "cikar") j = j.filter((x) => x.id !== o.id);
    else if (o.islem === "kurum-cikar") j = j.filter((x) => x.tenant_id !== o.kurum);
    else throw new Error(`enjekte: bilinmeyen islem ${o.islem}`);
    process.stderr.write(`[enjekte] ${tablo}: ${o.islem} ${o.id ?? o.kurum}\n`);
  }
  return new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
};
