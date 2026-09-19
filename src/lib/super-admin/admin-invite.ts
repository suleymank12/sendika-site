/**
 * Tenant'a admin ekleme — "bu e-postaya ne göndermeliyim?" kararı.
 *
 * 8 Eylül 2026 CANLI BUG (regresyon kaydı):
 *   Süper admin panelden bir tenant'a admin eklerken, e-posta Supabase
 *   Auth'ta ZATEN KAYITLIYSA hiçbir mail gitmiyor ama panel "eklendi /
 *   davet gönderildi" diyor. Sebep: her iki route da daveti
 *   `if (!userId) { ... }` bloğunun İÇİNDE gönderiyordu — kullanıcı varsa
 *   blok atlanıyor, `inviteUserByEmail` HİÇ çağrılmıyordu. Hata yutulmuyordu;
 *   çağrı hiç yapılmıyordu. Panel de sonucu sormadan sabit "davet gönderildi"
 *   mesajı basıyordu. Davet edilen kişi hiçbir şey almıyor, süper admin
 *   gönderildiğini sanıyordu.
 *
 * 9 Eylül 2026 — canlı Supabase'te (custom SMTP / Resend) taze adreslerle
 * ÖLÇÜLDÜ, tahmin değil:
 *
 *   | Auth durumu                          | inviteUserByEmail | mail       |
 *   |--------------------------------------|-------------------|------------|
 *   | kayıt yok                            | başarılı          | GELDİ      |
 *   | kayıtlı, daveti hiç kabul etmemiş    | başarılı          | GELDİ      |
 *   | kayıtlı, şifresini belirlemiş/girmiş | 422 email_exists  | (yok)      |
 *
 *   Ayrıca: `generateLink()` link üretir ama MAIL GÖNDERMEZ (taze adrese
 *   hiçbir şey ulaşmadı) — "davet gönderiliyor" sanılıp kullanılamaz.
 *   `resetPasswordForEmail` onaylanmamış kullanıcıda bile mail gönderiyor,
 *   yani 2. dal için alternatifti; ancak yeniden davet ölçümle çalıştığı için
 *   akış tek çağrıda (inviteUserByEmail) tutuldu — kişi "davet" bekliyor,
 *   "şifre sıfırlama" değil.
 *
 * AYIRICI ALAN — neden `last_sign_in_at`:
 *   Ölçüm gösteriyor ki daveti asıl reddettiren alan `email_confirmed_at`.
 *   Bu uygulamada ikisi birlikte dolar: davet linkine tıklamak
 *   `davet-kabul` sayfasında `setSession` çağırır, bu da hem e-postayı
 *   onaylar hem `last_sign_in_at`'i yazar. `last_sign_in_at` kullanıcıya
 *   anlatılabilir tek alan ("giriş yapmış mı?"), mesajlar da onun üstüne
 *   kurulu. Yine de 3. dalda davet çağrısı YAPILIR ve hatası raporlanır —
 *   yani ayırıcı yanılsa bile sonuç sessiz kalmaz, "invite_failed" döner.
 */

/**
 * Kararın okuduğu tek alan. `AuthUserSummary` (lib/supabase/admin-helpers)
 * bu şekli yapısal olarak karşılar — bu modül bilerek importsuz tutuldu ki
 * test betiği (scripts/test-tenant-user-add.mjs) doğrudan çalıştırabilsin.
 */
export interface ExistingAuthUser {
  last_sign_in_at: string | null;
}

/** API cevabındaki `outcome` alanı — panel mesajı buna göre seçer. */
export type AdminInviteOutcome =
  /** Auth'ta kayıt yoktu: kullanıcı oluşturuldu, davet gitti. */
  | "invited"
  /** Kayıt vardı ama daveti hiç kabul etmemişti: davet yeniden gönderildi. */
  | "reinvited"
  /** Kayıt vardı ve giriş yapmış: sadece bağlandı, MAİL GÖNDERİLMEDİ. */
  | "linked_existing"
  /** Bağlandı fakat davet çağrısı hata verdi (kısmi başarı — 207). */
  | "invite_failed";

export type AdminInviteAction =
  | { kind: "invite"; outcome: "invited" }
  | { kind: "reinvite"; outcome: "reinvited" }
  | { kind: "link_only"; outcome: "linked_existing" };

/**
 * Auth kaydının durumuna göre ne yapılacağını söyler. Saf fonksiyon:
 * ağ yok, yan etki yok — üç dalın tamamı testte kilitli.
 *
 * - `null` (kayıt yok)      → invite    (kullanıcıyı oluşturur + davet yollar)
 * - giriş yapmamış          → reinvite  (aynı çağrı; daveti yeniden yollar)
 * - giriş yapmış            → link_only (davet REDDEDİLİR, çağırma)
 */
export function decideAdminInviteAction(
  existingUser: ExistingAuthUser | null
): AdminInviteAction {
  if (!existingUser) {
    return { kind: "invite", outcome: "invited" };
  }
  if (existingUser.last_sign_in_at) {
    return { kind: "link_only", outcome: "linked_existing" };
  }
  return { kind: "reinvite", outcome: "reinvited" };
}

/**
 * Süper admin'e gösterilecek mesajlar. Teknik terim yok; okuyan kişi
 * "şimdi ne olacak / karşı tarafa ne söylemeliyim" sorusunu cevaplayabilmeli.
 */
export const ADMIN_INVITE_MESSAGES: Record<AdminInviteOutcome, string> = {
  invited: "Davet gönderildi.",
  reinvited:
    "Bu kişi sistemde kayıtlıydı ama daveti hiç kabul etmemiş. Davet yeniden gönderildi.",
  linked_existing:
    "Bu kişi sistemde zaten kayıtlı. Mevcut şifresiyle girebilir — davet maili gönderilmedi.",
  invite_failed:
    "Kullanıcı kuruma bağlandı fakat davet maili gönderilemedi. Tekrar deneyin veya kişiye \"Şifremi unuttum\" adımını kullanmasını söyleyin.",
};

/**
 * Davet linkinin taşıdığı kurum: `/admin/davet-kabul?tenant=<uuid>`.
 *
 * 10 Eylül 2026 — `.limit(1)` bug'ı: kabul sayfası kişiyi `tenant_users`'tan
 * SIRALAMASIZ `.limit(1)` ile seçtiği kuruma yolluyordu. Birden fazla kuruma
 * üye (ya da arka arkaya iki kuruma davet edilen) kişi, davet edildiği kurum
 * yerine rastgele birine düşebiliyordu. Artık her davet linki kendi kurumunu
 * taşıyor.
 *
 * NEDEN QUERY PARAMETRESİ (user_metadata değil): Supabase Auth, onaylanmamış
 * mevcut kullanıcıya yapılan yeniden davette `data`'yı YOK SAYIYOR (yalnızca
 * yeni kullanıcıda uygulanıyor) — "A'ya davet, kabul etmeden B'ye ekle"
 * senaryosunda metadata A'da kalırdı. Üstelik metadata kişi başına TEK alan;
 * query parametresi her linkte ayrı: GEÇERLİ bir link kişiyi kendi kurumuna
 * götürür. Kişinin elinde aynı anda birden fazla davet linki olabilir. Biri
 * kullanılınca hesap onaylanır ve Supabase kalan davet token'larını temizler
 * (Auth kaynağı: User.Confirm) — diğer linkler "Davet Linki Geçersiz"
 * ekranına düşer (bkz. parseAuthLinkError). 10 Eylül 2026 canlı ölçümünde
 * eski link yine de açılmıştı: sayfa `#error=`'u okumayıp tarayıcıdaki mevcut
 * oturuma düşüyordu — düzeltildi (NOTE.md "Davranış — ölçüldü").
 *
 * NEDEN KORUNUYOR (Supabase Auth kaynağından okundu): auth-js `redirect_to`'yu
 * kodlayarak yollar; sunucu adresi doğrular, mail linkine kaçışlayarak gömer ve
 * /verify sonrası token'ları `adres + "#" + ...` diye SONA ekler — query olduğu
 * gibi kalır. Adres Site URL ile aynı host'taysa doğrulama path/query'ye hiç
 * bakmaz; farklı host'ta (dev: *.lvh.me) Redirect URLs deseniyle TAM eşleşme
 * aranır, bu yüzden desen `...davet-kabul*` biçiminde olmalı (KURULUM.md Adım 6).
 *
 * NEDEN UUID (slug değil): slug `update-tenant` ile değiştirilebiliyor; davet
 * ile kabul arasında değişirse link bozulurdu.
 *
 * GÜVENLİK: parametre bir İPUCU, yetki değil. Kabul sayfası onu yalnızca
 * kişinin KENDİ üyelikleri arasında arar (`chooseInviteTenant`) — parametreyle
 * oynayan kişi en fazla kendi kurumları arasında seçim yapabilir.
 */
export const INVITE_TENANT_PARAM = "tenant";

/** Davet linkinin ait olduğu kurum. */
export interface InviteTenantRef {
  id: string;
  slug: string;
}

/**
 * Davet linkinin döneceği adres (+ `?tenant=<uuid>`).
 *
 * Production'da `NEXT_PUBLIC_SITE_URL` kullanılır (tenant subdomain'i değil:
 * davet kabulü tek adreste toplanır, `davet-kabul` kişiyi sonra doğru
 * kuruma yollar). Değişken tanımsızsa eskiden string'e
 * "undefined/admin/davet-kabul" yazılıyordu — Supabase böyle bir redirect'i
 * izin listesinde bulamayıp sessizce proje Site URL'ine düşerdi. Artık
 * tanımsızsa `undefined` döner: aynı fallback, ama bozuk URL üretmeden ve
 * sunucu log'una düşen açık bir uyarıyla. (O durumda kurum parametresi de
 * kaybolur; kabul sayfası en son eklenen üyeliğe düşer.)
 */
export function buildInviteRedirectUrl(tenant: InviteTenantRef): string | undefined {
  const query = `?${INVITE_TENANT_PARAM}=${encodeURIComponent(tenant.id)}`;

  if (process.env.NODE_ENV !== "production") {
    return `http://${tenant.slug}.lvh.me:3000${AUTH_RETURN_PATH}${query}`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    console.error(
      "[admin-invite] NEXT_PUBLIC_SITE_URL tanımsız — davet linki Supabase " +
        "proje Site URL'ine düşecek. Ortam değişkenini tanımlayın " +
        "(bkz. .env.local.example)."
    );
    return undefined;
  }

  return `${siteUrl.replace(/\/+$/, "")}${AUTH_RETURN_PATH}${query}`;
}

/**
 * Davet ve şifre sıfırlama linklerinin döndüğü YOL.
 *
 * Aynı değer `setup-checklist.ts` (AUTH_RETURN_PATH) ve `setup-probes.ts`
 * (SUPABASE_RETURN_PATH) içinde de var — o dosyalar Kurulum Durumu'nun
 * yoklamalarını besliyor. Üç sabit birbirinden BAĞIMSIZ tanımlı (bu dosya
 * bilerek import'suz; bkz. başlık); `test-auth-link.mjs` üçünün eşit
 * olduğunu doğruluyor.
 */
export const AUTH_RETURN_PATH = "/admin/davet-kabul";

/**
 * Şifre sıfırlama linkinin döneceği adres — `origin` + dönüş yolu.
 *
 * 🔴 SORGU PARAMETRESİ TAŞIMAZ ve taşımamalı. Sebep AUTH_LINK_JOINER'da
 * yazılı: mail şablonu jetonu bu adrese `?` ile ekliyor. Buraya bir query
 * eklenirse link `...?a=1?token_hash=...` olur ve `token_hash` SESSİZCE
 * kaybolur. `test-auth-link.mjs` bunu commit anında yakalar.
 *
 * Davetin aksine kurum (`?tenant=`) TAŞINMAZ: sıfırlama zaten kişinin kendi
 * kurumunun adresinde başlar ve oraya döner; kabul sayfası da sıfırlama
 * modunda kişiyi panele değil `/admin/giris`e yolluyor.
 */
export function buildRecoveryReturnUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${AUTH_RETURN_PATH}`;
}

/**
 * 🔴 MAİL ŞABLONU SÖZLEŞMESİ — jeton dönüş adresine hangi karakterle eklenir.
 *
 * Bu karakter KODDA DEĞİL, Supabase panelindeki mail şablonunda yaşıyor:
 *
 *     Reset Password : <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">
 *     Invite User    : <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">
 *
 * `{{ .RedirectTo }}` kodun gönderdiği (ve Supabase'in DOĞRULADIĞI) dönüş
 * adresidir. Sıfırlamanın dönüş adresi query TAŞIMAZ → `?` ile bağlanır;
 * davetinki `?tenant=<uuid>` TAŞIR → `&` ile bağlanır.
 *
 * YANLIŞ KARAKTER SESSİZ ARIZA ÜRETİR — 20 Eylül 2026 ölçümü:
 *
 *     .../davet-kabul?tenant=abc-123?token_hash=HASH&type=invite
 *     → tenant     = "abc-123?token_hash=HASH"   (kirlendi)
 *     → token_hash = null                        (KAYBOLDU)
 *
 * Yani link hata vermez, jeton yok olur. Şablon repoda olmadığı için tek
 * savunma bu sabit + `test-auth-link.mjs`: sabit değişirse ya da dönüş
 * adresinin şekli değişirse test KIRILIR.
 *
 * ⚠️ Davet satırı P3'te devreye girecek (bugün davet hâlâ
 * `{{ .ConfirmationURL }}` kullanıyor); sabit şimdiden burada ki sıra
 * geldiğinde karakter tartışması yeniden açılmasın.
 */
export const AUTH_LINK_JOINER = {
  recovery: "?",
  invite: "&",
} as const;

/** Mail linkinin taşıdığı akış — `type` parametresinin kabul edilen değerleri. */
export type AuthLinkMode = "invite" | "recovery";

/**
 * Supabase mail şablonunun üreteceği linki KODDA kurar — yalnızca testte
 * kullanılır (üretimde bu linki Supabase'in şablon motoru üretir).
 *
 * Şablon repoda olmadığı için "şablonun üreteceği şey" ancak böyle
 * sınanabilir: sözleşmeyi (AUTH_LINK_JOINER + dönüş adresinin şekli) tek
 * yerde birleştirir, test de çıkan linki gerçek ayrıştırıcıya verir.
 */
export function buildTemplateAuthLink(
  returnUrl: string,
  mode: AuthLinkMode,
  tokenHash: string
): string {
  return `${returnUrl}${AUTH_LINK_JOINER[mode]}token_hash=${encodeURIComponent(
    tokenHash
  )}&type=${mode}`;
}

/**
 * Kabul sayfasının (davet-kabul) URL'den okuduğu GİRİŞ YOLU.
 *
 * - `error`      : Supabase linki reddetti (#error=... / ?error=...)
 * - `token_hash` : YENİ yol — şablon jetonu taşıyor, sayfa `verifyOtp` çağırır
 * - `hash_token` : davet (implicit) — `#access_token=...&refresh_token=...`
 * - `pkce`       : ESKİ sıfırlama linkleri (`?code=...`) — geçiş dönemi
 * - `none`       : linkten okunacak bir şey yok (oturum kontrolüne düşer)
 */
export type AuthLinkRoute =
  | { route: "error"; error: AuthLinkError }
  | { route: "token_hash"; tokenHash: string; mode: AuthLinkMode }
  | { route: "hash_token"; accessToken: string; refreshToken: string; mode: AuthLinkMode }
  | { route: "pkce" }
  | { route: "none" };

/**
 * Linkin hangi yolla geldiğine karar verir. SAF fonksiyon — `window` yok.
 *
 * SIRA ÖNEMLİ (öncelik, çakışma değil):
 *  1. Hata her şeyin önünde gelir. auth-js URL'deki hatada tarayıcıdaki
 *     MEVCUT oturumu silmiyor; sayfa hatayı görmezse o oturuma düşer ve
 *     geçersiz linke tıklayan kişiye şifre formu gösterir (10 Eylül 2026
 *     yan bulgusu, bkz. `parseAuthLinkError`).
 *  2. token_hash — yeni akış.
 *  3. hash token — davet.
 *  4. ?code — eski sıfırlama linkleri (şablon değişince tükenirler).
 *
 * `type` bilinmeyen bir değerse (`signup` vb.) token_hash yolu KABUL
 * EDİLMEZ: bu uygulamada yalnızca davet ve sıfırlama mailleri var, geri
 * kalanı "okunacak bir şey yok" sayılır.
 */
export function parseAuthLink(search: string, hash: string): AuthLinkRoute {
  const linkError = parseAuthLinkError(hash, search);
  if (linkError) {
    return { route: "error", error: linkError };
  }

  const query = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));

  const tokenHash = (query.get("token_hash") ?? "").trim();
  const queryType = (query.get("type") ?? "").trim();
  if (tokenHash && isAuthLinkMode(queryType)) {
    return { route: "token_hash", tokenHash, mode: queryType };
  }

  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  if (accessToken && refreshToken) {
    const hashType = (hashParams.get("type") ?? "").trim();
    return {
      route: "hash_token",
      accessToken,
      refreshToken,
      // Hash'te `type` yoksa davet sayılır — bugünkü sayfanın davranışı.
      mode: hashType === "recovery" ? "recovery" : "invite",
    };
  }

  if ((query.get("code") ?? "").trim()) {
    return { route: "pkce" };
  }

  return { route: "none" };
}

function isAuthLinkMode(value: string): value is AuthLinkMode {
  return value === "invite" || value === "recovery";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * URL'den / sessionStorage'dan gelen ham kurum değerini doğrular. Geçerli
 * UUID ise küçük harfe normalize edip döner (Postgres UUID'i küçük harf
 * döndürür); değilse `null` — geçersiz değer "parametre yok" sayılır.
 */
export function parseInviteTenantId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return UUID_RE.test(value) ? value.toLowerCase() : null;
}

/** Kabul sayfasının okuduğu üyelik satırı (`tenant_users` alt kümesi). */
export interface InviteMembership {
  tenant_id: string;
  created_at: string | null;
}

export type InviteTenantChoice =
  /** Davet linkinin kurumu — kişi ona gerçekten üye. */
  | { tenantId: string; source: "invite_link" }
  /**
   * Yedek: en son eklenen üyelik.
   * - `no_param`: link kurum taşımıyor (eski format / SITE_URL tanımsız).
   * - `not_a_member`: link bir kurum taşıyor ama kişi ona üye değil (üyelik
   *   sonradan silinmiş ya da parametre elle değiştirilmiş).
   */
  | { tenantId: string; source: "latest_membership"; reason: "no_param" | "not_a_member" };

/**
 * Davet kabulünden sonra kişinin yönlendirileceği kurumu seçer. Saf fonksiyon.
 *
 * 1. `requestedTenantId` geçerli ve kişi o kuruma ÜYE → o kurum.
 * 2. Değilse → EN SON eklenen üyelik (`created_at` en büyük): yeni gelen davet
 *    çoğu zaman en son eklenen üyeliktir. Kurum seçici ekranı bilerek YOK
 *    (gereksiz sürtünme). `created_at` okunamayan satır en sona düşer;
 *    eşitlikte girdi sırası korunur — sorgu zaten `created_at DESC` sıraladığı
 *    için tarih okunamasa bile DB sırası geçerli kalır.
 * 3. Hiç üyelik yok → `null` (sayfa /admin/yetkisiz'e yollar).
 */
export function chooseInviteTenant(
  memberships: readonly InviteMembership[],
  requestedTenantId: string | null
): InviteTenantChoice | null {
  if (memberships.length === 0) return null;

  const requested = parseInviteTenantId(requestedTenantId);
  if (requested) {
    const hit = memberships.find((m) => parseInviteTenantId(m.tenant_id) === requested);
    if (hit) return { tenantId: hit.tenant_id, source: "invite_link" };
  }

  const time = (m: InviteMembership): number => {
    const t = m.created_at ? Date.parse(m.created_at) : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };
  const latest = [...memberships].sort((a, b) => {
    const ta = time(a);
    const tb = time(b);
    return ta === tb ? 0 : tb > ta ? 1 : -1;
  })[0];

  return {
    tenantId: latest.tenant_id,
    source: "latest_membership",
    reason: requested ? "not_a_member" : "no_param",
  };
}

/** Supabase'in /verify hatasında dönüş adresine eklediği bilgi. */
export interface AuthLinkError {
  /** Supabase hata kodu (örn. "otp_expired"); gelmediyse null. */
  code: string | null;
  /**
   * Hatanın geldiği akış. Supabase hatayı HER ZAMAN hash'e yazar; PKCE
   * akışında ayrıca query'ye de yazar (Auth kaynağı: prepErrorRedirectURL).
   * Bu uygulamada PKCE = tarayıcıdan başlayan ESKİ şifre sıfırlama linkleri,
   * implicit = sunucudan gönderilen davet.
   *
   * `token_hash`: bu değeri `parseAuthLinkError` URL'den ÜRETMEZ — hata adres
   * çubuğunda değil, kabul sayfasının `verifyOtp` cevabında geldiğinde sayfa
   * elle bu değeri yazar (20 Eylül 2026, yeni sıfırlama akışı). Amacı
   * "Geçersiz" ekranında hata kodunu gösterebilmek.
   */
  flow: "implicit" | "pkce" | "token_hash";
}

const AUTH_ERROR_KEYS = ["error", "error_code", "error_description"] as const;

/**
 * Davet / sıfırlama linkinin dönüş adresinde Supabase hatası var mı?
 * Örnek (kullanılmış davet linki):
 *   `?tenant=<uuid>#error=access_denied&error_code=otp_expired&error_description=...&sb=`
 *
 * NEDEN GEREKLİ: auth-js URL'deki hatada tarayıcıdaki mevcut oturumu bilerek
 * SİLMİYOR ("Don't remove existing session on URL login failure"). Kabul
 * sayfası hatayı görmezse `getSession()` ile o oturuma düşer ve geçersiz
 * linke tıklayan kişiye şifre formu gösterir — oturumdaki kişinin şifresi
 * değişir (10 Eylül 2026 yan bulgusu). Hata varsa sayfa "Geçersiz" ekranını
 * gösterir, oturuma DÜŞMEZ. Boş değerli anahtarlar hata sayılmaz.
 */
export function parseAuthLinkError(hash: string, search: string): AuthLinkError | null {
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(search);
  const hasError = (params: URLSearchParams) =>
    AUTH_ERROR_KEYS.some((key) => (params.get(key) ?? "").trim() !== "");

  const inHash = hasError(hashParams);
  const inQuery = hasError(queryParams);
  if (!inHash && !inQuery) return null;

  const code =
    (hashParams.get("error_code") ?? "").trim() ||
    (queryParams.get("error_code") ?? "").trim() ||
    null;
  return { code, flow: inQuery ? "pkce" : "implicit" };
}

/**
 * "Geçersiz" ekranının neden cümlesi.
 *
 * `otp_expired` için "süresi dolmuş" DEMİYORUZ: Supabase bu kodu hem süresi
 * dolmuş token'da hem BULUNAMAYAN token'da (daha önce kullanılmış, ya da hesap
 * başka bir davet linkiyle onaylanıp token'lar temizlenmiş) döndürüyor — mesajı
 * da tek: "Email link is invalid or has expired". Bu uygulamada en sık görülen
 * durum ikincisi (birden fazla davet maili). Diğer kodlar nadir ve kullanıcı
 * için ayrıştırılacak bir anlam taşımıyor → genel cümle. Kod ekranda ayrıca
 * gösterilir (destek için).
 */
export function describeAuthLinkError(code: string | null): string {
  if (code === "otp_expired") {
    return "Bu bağlantının süresi dolmuş ya da bağlantı daha önce kullanılmış.";
  }
  return "Bu bağlantı doğrulanamadı.";
}
