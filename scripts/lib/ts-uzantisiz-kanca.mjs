/**
 * TEST YUKLEME KANCASI — uzantisiz goreli .ts iceri almalari (C3, 25 Eylul 2026).
 *
 * Node'un TS ayiklamasi (22.18+) `.ts` dosyasini dogrudan calistirir ama ESM
 * cozumleyicisi uzantisiz goreli yolu (`import … from "./zaman-asimli-fetch"`)
 * COZMEZ: ERR_MODULE_NOT_FOUND. Webpack/Next ve tsc icin sorun degil; yalniz
 * urun modulunu dogrudan iceri alan test betikleri etkilenir.
 *
 * Kanca YALNIZ su durumda devreye girer: ust modul bir `.ts` dosyasi, yol
 * `./` ya da `../` ile basliyor ve varsayilan cozumleme bulamiyor → ayni yol
 * `.ts` ekiyle denenir. Urun kodu degismez.
 *
 * Kullanim: `import { tsUzantisizKancaKur } from "./lib/ts-uzantisiz-kanca.mjs";`
 * `tsUzantisizKancaKur();` — SONRA urun modulu DINAMIK import edilir (statik
 * import'lar kanca kurulmadan once baglanir).
 */
import { registerHooks } from "node:module";

let kuruldu = false;

export function tsUzantisizKancaKur() {
  if (kuruldu) return;
  kuruldu = true;
  registerHooks({
    resolve(belirtec, baglam, sonraki) {
      try {
        return sonraki(belirtec, baglam);
      } catch (hata) {
        const goreli = belirtec.startsWith("./") || belirtec.startsWith("../");
        if (hata?.code === "ERR_MODULE_NOT_FOUND" && goreli && baglam.parentURL?.endsWith(".ts")) {
          return sonraki(`${belirtec}.ts`, baglam);
        }
        throw hata;
      }
    },
  });
}
