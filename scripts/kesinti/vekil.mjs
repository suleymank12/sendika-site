/**
 * ARIZA ENJEKTORU — yerel TLS vekili (Supabase kesinti dayanikliligi, C0).
 *
 * Ayri build'de `NEXT_PUBLIC_SUPABASE_URL=https://localhost` → bu vekil
 * (443) → gercek Supabase. Mod calisma aninda degisir; her degisimde acik
 * soketler yok edilir (undici havuzu yeniden baglanmak zorunda kalsin).
 *
 *   pass       GET/HEAD/OPTIONS gercek Supabase'e iletilir
 *   delay      her istek `gecikmeMs` bekletilir, sonra pass
 *   blackhole  TCP kabul edilir, TLS el sikismasi HIC yapilmaz
 *              → undici UND_ERR_CONNECT_TIMEOUT (10 sn) — olaydaki hata kodu
 *   refuse     dinleme soketi kapatilir → ECONNREFUSED (hizli ret)
 *   cf5xx      her istege HIZLI 522 (ya da `cfDurum`) + Cloudflare benzeri HTML
 *              govde (Tur 2, 24 Eylul 2026 — olayda log'a HTML basiliyordu)
 *
 * Tur 2 secenekleri: `gecikmeYontem` (delay yalniz bu HTTP yontemine uygulanir,
 * ör. "PATCH" — yazma zaman asimi senaryosu); `sahteRest` ({ yol: {durum,
 * govde, basliklar} }) — GET/HEAD icin YEREL sahte cevap (S1 teshisi; disari
 * hic gitmez).
 *
 * 🔴 YAZMA ENGELI (kalici, her modda): GET/HEAD/OPTIONS DISINDAKI HER YONTEM
 * vekilde 403 alir, gercek Supabase'e HIC ulasmaz. Iki yerel sahte cevap da
 * yalniz vekilde uretilir, hicbiri disari gitmez:
 *   authKota   { basarili: N, sonra: "kopar" | "ilet" } — GET /auth/v1/user
 *              ilk N istekte YERELDE sahte kullanici doner; sonra soket
 *              koparilir (tasima hatasi) ya da gercege iletilir.
 *   rpcCevap   "false" | "true" — POST /rest/v1/rpc/is_super_admin YERELDE
 *              bu JSON ile cevaplanir (yazma degil; hic iletilmez).
 *   authYenileme "basarili" | { durum, govde } — POST /auth/v1/token (jeton
 *              yenileme) YERELDE cevaplanir (Tur 2 / C6a, 25 Eylul 2026):
 *              "basarili" → yeni sahte oturum (access_token 1 saat gecerli,
 *              refresh_token "yenilenmis-sahte-N"); nesne → o durum + JSON
 *              govde (ör. 400 refresh_token_not_found). Hic iletilmez.
 */
import net from "node:net";
import https from "node:https";

export const SAHTE_KULLANICI = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "sahte@ornek.invalid",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

const OKUMA = new Set(["GET", "HEAD", "OPTIONS"]);

const b64u = (s) => Buffer.from(s).toString("base64url");
/** Yenileme cevabi — kos.mjs sahteCerez ile ayni bicim (imza sahte; sunucu JWT'yi dogrulamaz, getUser'a sorar). */
function sahteOturum(n) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = [b64u('{"alg":"HS256","typ":"JWT"}'), b64u(JSON.stringify({ sub: SAHTE_KULLANICI.id, exp, role: "authenticated", aud: "authenticated", session_id: "22222222-2222-4222-8222-222222222222" })), "eWVuaWxlbm1pcw"].join(".");
  return { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: `yenilenmis-sahte-${n}`, user: SAHTE_KULLANICI };
}

export function vekilBaslat({ port = 443, key, cert, gercekUrl }) {
  const gercek = new URL(gercekUrl);
  let mod = "pass";
  let gecikmeMs = 0;
  let authKota = null;
  let rpcCevap = null;
  let gecikmeYontem = null;
  let cfDurum = 522;
  let sahteRest = null;
  let authYenileme = null;
  let yenilemeSayaci = 0;
  let seq = 0;
  const kayit = [];
  const t0 = Date.now();
  const soketler = new Set();
  const log = (o) => kayit.push({ i: ++seq, t: Date.now() - t0, ...o });

  const tls = https.createServer({ key, cert }, async (req, res) => {
    const bas = Date.now();
    const u = new URL(req.url, "https://localhost");
    const yol = u.pathname;
    const m = mod;
    log({ ev: "istek", yontem: req.method, yol, mod: m });
    if (m === "cf5xx") {
      req.resume();
      res.writeHead(cfDurum, { "content-type": "text/html; charset=UTF-8", server: "cloudflare" });
      res.end(`<!DOCTYPE html>\n<html lang="en-US"><head><title>localhost | ${cfDurum}: Connection timed out</title><style>body{font-family:sans-serif}</style></head><body><div id="cf-wrapper"><h1>Connection timed out</h1><span>Error code ${cfDurum}</span><p>Visit cloudflare.com for more information.</p>${"<div class=\"cf-pad\"></div>".repeat(40)}</div></body></html>`);
      log({ ev: "cf5xx", yontem: req.method, yol, durum: cfDurum });
      return;
    }
    if (m === "delay" && (!gecikmeYontem || req.method === gecikmeYontem)) await new Promise((r) => setTimeout(r, gecikmeMs));
    if (sahteRest && OKUMA.has(req.method) && sahteRest[yol]) {
      const s = sahteRest[yol];
      req.resume();
      res.writeHead(s.durum ?? 200, { "content-type": "application/json", ...(s.basliklar || {}) });
      res.end(typeof s.govde === "string" ? s.govde : JSON.stringify(s.govde));
      log({ ev: "sahte-rest", yol });
      return;
    }

    if (req.method === "GET" && yol === "/auth/v1/user" && authKota) {
      if (authKota.basarili > 0) {
        authKota.basarili -= 1;
        req.resume();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(SAHTE_KULLANICI));
        log({ ev: "sahte-kullanici", yol });
        return;
      }
      if (authKota.sonra === "kopar") {
        log({ ev: "koparildi", yol });
        req.socket.destroy();
        return;
      }
    }
    if (req.method === "POST" && yol === "/rest/v1/rpc/is_super_admin" && rpcCevap !== null) {
      req.resume();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(rpcCevap);
      log({ ev: "sahte-rpc", yol, cevap: rpcCevap });
      return;
    }
    if (req.method === "POST" && yol === "/auth/v1/token" && authYenileme !== null) {
      req.resume();
      const basarili = authYenileme === "basarili";
      res.writeHead(basarili ? 200 : authYenileme.durum, { "content-type": "application/json" });
      res.end(JSON.stringify(basarili ? sahteOturum(++yenilemeSayaci) : authYenileme.govde));
      log({ ev: "sahte-yenileme", yol, durum: basarili ? 200 : authYenileme.durum });
      return;
    }
    if (!OKUMA.has(req.method)) {
      req.resume();
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "vekil: yazma engellendi", code: "vekil_403" }));
      log({ ev: "engellendi", yontem: req.method, yol, ms: Date.now() - bas });
      return;
    }
    const headers = { ...req.headers, host: gercek.host };
    delete headers.connection;
    const ust = https.request({ host: gercek.hostname, port: 443, method: req.method, path: req.url, headers }, (ur) => {
      res.writeHead(ur.statusCode, ur.headers);
      ur.pipe(res);
      ur.on("end", () => log({ ev: "yanit", yol, durum: ur.statusCode, ms: Date.now() - bas }));
    });
    ust.on("error", (e) => {
      log({ ev: "ust-hata", yol, hata: String(e.code || e.message) });
      try { res.writeHead(502); res.end(); } catch { /* soket gitti */ }
    });
    req.pipe(ust);
  });
  tls.on("secureConnection", (s) => { soketler.add(s); s.on("close", () => soketler.delete(s)); });
  tls.on("tlsClientError", () => {});

  const ham = net.createServer((sock) => {
    soketler.add(sock);
    sock.on("close", () => soketler.delete(sock));
    sock.on("error", () => {});
    if (mod === "blackhole") { log({ ev: "tcp-karadelik" }); return; }
    tls.emit("connection", sock);
  });

  let dinliyor = false;
  const dinle = () => new Promise((ok, hata) => {
    if (dinliyor) return ok();
    const h = (e) => { ham.off("listening", l); hata(e); };
    const l = () => { ham.off("error", h); dinliyor = true; ok(); };
    ham.once("error", h);
    ham.once("listening", l);
    ham.listen({ port, host: "::", ipv6Only: false });
  });
  const soketleriYokEt = () => { for (const s of soketler) s.destroy(); soketler.clear(); };
  const dinlemeyiKes = () => new Promise((ok) => {
    soketleriYokEt();
    if (!dinliyor) return ok();
    ham.close(() => { dinliyor = false; ok(); });
  });

  return {
    baslat: dinle,
    async mod(yeni, secenek = {}) {
      mod = yeni;
      gecikmeMs = secenek.gecikmeMs || 0;
      authKota = secenek.authKota ? { ...secenek.authKota } : null;
      rpcCevap = secenek.rpcCevap ?? null;
      gecikmeYontem = secenek.gecikmeYontem ?? null;
      cfDurum = secenek.cfDurum ?? 522;
      sahteRest = secenek.sahteRest ?? null;
      authYenileme = secenek.authYenileme ?? null;
      soketleriYokEt();
      log({ ev: "mod", mod: yeni, gecikmeMs, authKota, rpcCevap });
      if (yeni === "refuse") await dinlemeyiKes();
      else await dinle();
    },
    seq: () => seq,
    kayit: (since = 0) => kayit.filter((e) => e.i > since),
    kapat: dinlemeyiKes,
  };
}
