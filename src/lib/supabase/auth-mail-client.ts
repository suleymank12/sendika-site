import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { zamanAsimliFetch } from "./zaman-asimli-fetch";

/**
 * Mail TETIKLEYEN auth cagrilari icin PKCE'siz, depolamasiz istemci
 * (20 Eylul 2026 — sifre sifirlama PKCE'den cikariliyor).
 *
 * ## Neden var — 19 Eylul 2026 canli bug'i
 *
 * "Sifremi unuttum" linki BASKA bir tarayicida/cihazda acilinca calismiyordu.
 * Supabase auth loglari (UTC):
 *
 *     17:18:45  /recover  200  user_recovery_requested   (TEK istek)
 *     17:18:58  /verify   303  auth_event: action=login  ← BASARILI
 *     17:19:04  /verify   403  "One-time token not found"
 *     17:19:26  /verify   403  "One-time token not found"
 *
 * Yani link ilk kullanimda calisti; kullanicinin gordugu "gecersiz" ekrani
 * ikinci/ucuncu denemeydi. Ilk denemede sifre formunun gelmemesinin sebebi
 * PKCE: `resetPasswordForEmail` cagrilirken uretilen `code_verifier`
 * ISTEGIN YAPILDIGI tarayicinin deposunda kalir. Gizli pencerede istenip
 * normal pencerede tiklanan (ya da bilgisayardan istenip telefondan
 * tiklanan) link, kod takasi asamasinda dogrulayiciyi bulamaz:
 *
 *     GoTrueClient.js:1448-1454
 *     if (!codeVerifier && this.flowType === 'pkce')
 *       throw new AuthPKCECodeVerifierMissingError();
 *
 * Davet akisi ayni sorundan etkilenmiyordu cunku davet SUNUCUDAN
 * (`admin.auth.admin.inviteUserByEmail`) baslar — orada PKCE yoktur,
 * link implicit akisla doner (`#access_token=...&type=invite`).
 *
 * ## Neden AYRI DOSYA / ayri istemci
 *
 * `@supabase/ssr`'nin `createBrowserClient`'i `flowType` degerini
 * `...options?.auth` yayilimindan SONRA yaziyor — yani secenekle
 * EZILEMEZ (olculdu, `createBrowserClient.js:33-40`):
 *
 *     auth: {
 *       ...options?.auth,
 *       ...(options?.cookieOptions?.name ? { storageKey: ... } : null),
 *       flowType: "pkce",          // <-- yayilimdan SONRA: her zaman kazanir
 *       ...
 *     }
 *
 * Bu yuzden `lib/supabase/client.ts`'e secenek gecirerek PKCE'den
 * cikilamiyor; mail tetikleyen cagri icin supabase-js'in kendi
 * `createClient`'i kullaniliyor (varsayilani implicit).
 *
 * ## Neden depolamasiz
 *
 * `persistSession: false` + `autoRefreshToken: false` +
 * `detectSessionInUrl: false`: bu istemci OTURUM tutmaz, URL'e bakmaz,
 * cerez/localStorage yazmaz. Boylece `lib/supabase/client.ts`'in cerez
 * tabanli oturumuyla ayni anahtar uzerinden CAKISMAZ. Tek isi bir POST
 * atip mail tetiklemek.
 *
 * ## Nerede KULLANILMAZ
 *
 * Oturum gerektiren hicbir sey burada yapilmaz. Ozellikle:
 * `verifyOtp` / `updateUser` cagrilari `lib/supabase/client.ts` ile
 * yapilir — olusan oturumun cereze yazilmasi ve middleware tarafindan
 * gorulmesi gerekir.
 */
export function createAuthMailClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // 🔴 Bu satirin tamami bu dosyanin VARLIK SEBEBI (bkz. baslik).
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      // C3: mail tetikleyen istek bir yazmadir — yalniz 25 sn ust sinir.
      global: { fetch: zamanAsimliFetch("yazma") },
    }
  );
}
