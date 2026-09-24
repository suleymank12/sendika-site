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
 *
 * 🔴 YAZMA ENGELI (kalici, her modda): GET/HEAD/OPTIONS DISINDAKI HER YONTEM
 * vekilde 403 alir, gercek Supabase'e HIC ulasmaz. Iki yerel sahte cevap da
 * yalniz vekilde uretilir, hicbiri disari gitmez:
 *   authKota   { basarili: N, sonra: "kopar" | "ilet" } — GET /auth/v1/user
 *              ilk N istekte YERELDE sahte kullanici doner; sonra soket
 *              koparilir (tasima hatasi) ya da gercege iletilir.
 *   rpcCevap   "false" | "true" — POST /rest/v1/rpc/is_super_admin YERELDE
 *              bu JSON ile cevaplanir (yazma degil; hic iletilmez).
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

export function vekilBaslat({ port = 443, key, cert, gercekUrl }) {
  const gercek = new URL(gercekUrl);
  let mod = "pass";
  let gecikmeMs = 0;
  let authKota = null;
  let rpcCevap = null;
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
    if (m === "delay") await new Promise((r) => setTimeout(r, gecikmeMs));

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
