/**
 * IZOLASYON MATRISI — tam kosu: build + next start + matris + kapat.
 *
 *   npm run izolasyon:tam            # karsilastirma (temel cizgiye gore)
 *   npm run izolasyon:temel          # + temel cizgiyi kaydet (--kaydet)
 *   node scripts/izolasyon-kos.mjs --build-yok   # mevcut .next ile (build alma)
 *
 * NEDEN AYRI: `test:izolasyon` ayakta bir sunucu bekler ve yoksa ATLANDI der
 * (test:cerez deseni). Bu koşucu ise ATLAMAZ: production build'i kendisi
 * alir, 3100 portunda baslatir (3000'deki olasi dev sunucusuyla cakismaz),
 * matrisi IZOLASYON_ZORUNLU=1 ile kosar ve sunucuyu HER DURUMDA kapatir.
 *
 * ⚠️ `next build` .next'i yeniden yazar — ayni anda `next dev` calisiyorsa
 * dev sunucusu bozulur; once onu kapatin.
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const NEXT = path.join(REPO, "node_modules", "next", "dist", "bin", "next");
const PORT = process.env.IZOLASYON_PORT || "3100";
const TABAN = `http://127.0.0.1:${PORT}`;
const argv = process.argv.slice(2);
const BUILD_YOK = argv.includes("--build-yok");
const matrisArgs = argv.filter((a) => a !== "--build-yok");

async function ayakta() {
  // Yalniz canlilik yoklamasi. Host basligi YOK: Node fetch'i Host'u zaten
  // sessizce yok sayiyor (bkz. test-izolasyon-matrisi.mjs istek()).
  try {
    const r = await fetch(`${TABAN}/haberler`, { signal: AbortSignal.timeout(5000) });
    return r.status;
  } catch {
    return 0;
  }
}

if (await ayakta()) {
  console.log(`HATA: ${PORT} portunda zaten bir sunucu var — kapatin ya da IZOLASYON_PORT verin.`);
  process.exit(1);
}

if (!BUILD_YOK) {
  console.log("izolasyon:tam — 1/3 next build …");
  const t0 = Date.now();
  const b = spawnSync(process.execPath, [NEXT, "build"], { cwd: REPO, encoding: "utf8" });
  if (b.status !== 0) {
    console.log(b.stdout, b.stderr);
    console.log("HATA: build basarisiz — matris kosmadi.");
    process.exit(1);
  }
  console.log(`  build tamam (${Math.round((Date.now() - t0) / 1000)} sn)`);
}

console.log(`izolasyon:tam — 2/3 next start -p ${PORT} …`);
const sunucu = spawn(process.execPath, [NEXT, "start", "-p", PORT], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
let sunucuLog = "";
sunucu.stdout.on("data", (d) => (sunucuLog += d));
sunucu.stderr.on("data", (d) => (sunucuLog += d));

let kod = 1;
try {
  let durum = 0;
  for (let i = 0; i < 60 && !durum; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    durum = await ayakta();
  }
  if (!durum) {
    console.log(sunucuLog);
    throw new Error("sunucu 60 sn icinde ayaga kalkmadi");
  }
  console.log("izolasyon:tam — 3/3 matris …");
  const m = spawnSync(process.execPath, [path.join(REPO, "scripts", "test-izolasyon-matrisi.mjs"), ...matrisArgs], {
    cwd: REPO,
    stdio: "inherit",
    env: { ...process.env, IZOLASYON_URL: TABAN, IZOLASYON_ZORUNLU: "1" },
  });
  kod = m.status ?? 1;
} catch (e) {
  console.log(`HATA: ${e.message}`);
  kod = 1;
} finally {
  sunucu.kill();
  for (let i = 0; i < 20 && (await ayakta()); i++) await new Promise((r) => setTimeout(r, 500));
  if (await ayakta()) console.log(`⚠️  ${PORT} portundaki sunucu kapanmadi — elle kapatin.`);
}
process.exit(kod);
