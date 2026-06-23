# Elle Yapılacak İşler

Bu dosya, kod tarafında otomatize edilemeyen ama Supabase Dashboard veya
başka panellerden elle yapılması gereken adımları toplar.

---

# Sprint 1 Sonu Yapılacaklar

Sprint 1 push'tan **ÖNCE** Supabase Dashboard'da yapılacak işler. Sırayla
ve eksiksiz yapılmalı, yoksa davet ve şifre sıfırlama akışları çalışmaz.

## ⚠️ Kritik Sıralama

1. **Redirect URLs whitelist** (bu yapılmazsa hiçbir mail linki çalışmaz)
2. **Email template Türkçeleştirme** (kullanıcı deneyimi)
3. **Test senaryoları** (her şey çalışıyor mu doğrula)

---

## 1. Supabase Redirect URLs Whitelist

**Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**

Şu pattern'leri ekle (her biri ayrı satır):

```
http://*.lvh.me:3000/admin/davet-kabul
http://lvh.me:3000/admin/davet-kabul
https://sendika-site.vercel.app/admin/davet-kabul
```

**NOT:** Production custom domain bağlandığında o domain için de pattern
eklenmeli: `https://*.{custom-domain}/admin/davet-kabul`

**Bu ayar yapılmadan:**
- `inviteUserByEmail` çalışır ama Supabase `redirectTo`'yu reddeder
- Davet ve şifre sıfırlama linkleri default Site URL'e atar
- Token kaybolur, kullanıcı şifre belirleyemez

---

## 2. Invite User Email Template

**Supabase Dashboard → Authentication → Email Templates → Invite User**

**Subject:**
```
Sendika yönetim paneline davet edildiniz
```

**Body (HTML):**
```html
<h2>Merhaba,</h2>
<p>Sendika yönetim paneline davet edildiniz. Aşağıdaki bağlantıya
tıklayarak şifrenizi belirleyebilir ve panele erişebilirsiniz.</p>

<p><a href="{{ .ConfirmationURL }}">Şifre Belirle ve Panele Giriş Yap</a></p>

<p>Bu bağlantı 24 saat geçerlidir. Eğer siz değilseniz bu maili
görmezden gelebilirsiniz.</p>

<p>İyi çalışmalar.</p>
```

**Link URL alanına dokunma** — kod tarafında `redirectTo` zaten doğru
URL'e set ediyor (dev: `http://{slug}.lvh.me:3000/admin/davet-kabul`,
prod: `${NEXT_PUBLIC_SITE_URL}/admin/davet-kabul`).

---

## 3. Reset Password Email Template

**Supabase Dashboard → Authentication → Email Templates → Reset Password**

**Subject:**
```
Şifre sıfırlama talebi
```

**Body (HTML):**
```html
<h2>Merhaba,</h2>
<p>Hesabınız için şifre sıfırlama talebinde bulunuldu. Aşağıdaki
bağlantıya tıklayarak yeni şifrenizi belirleyebilirsiniz.</p>

<p><a href="{{ .ConfirmationURL }}">Yeni Şifre Belirle</a></p>

<p>Eğer bu talebi siz yapmadıysanız bu maili görmezden gelebilirsiniz.
Bağlantı 1 saat geçerlidir.</p>
```

**Link URL alanına dokunma** — kod tarafında zaten `redirectTo` set ediyor
(`${origin}/admin/davet-kabul`).

---

## 4. Confirm Signup Template (DEĞİŞTİRME)

Şu an sistemde public signup yok — yeni kullanıcılar sadece süper admin
tarafından davet ediliyor. Bu template kullanılmıyor, default kalsın.

---

## 5. Test Senaryoları (Sprint 1 toplu test)

Sprint 1'in tüm maddeleri (1.1 - 1.5) bitince push'tan **ÖNCE** lokal'de
test et.

### Test A: Yeni tenant + davet akışı
1. Süper admin (`suleymankaraman222@gmail.com`) ile
   `http://lvh.me:3000/admin/giris` üzerinden giriş yap.
2. Süper admin paneline geç → **"Yeni Tenant"** butonu.
3. İsim: `Test Acme`, slug: `test-acme`, admin email:
   `suleymankaraman222+test@gmail.com`
4. Davet maili gelmeli (subject Türkçe).
5. Link tıkla →
   `http://test-acme.lvh.me:3000/admin/davet-kabul#access_token=...&type=invite`
6. **"Şifrenizi Belirleyin"** sayfası açılmalı.
7. Şifre belirle (min 8 karakter) + tekrar → **"Şifreyi Belirle"** butonu.
8. `http://test-acme.lvh.me:3000/admin` adresine yönlenmeli.
9. Sidebar görünmeli, admin paneli çalışmalı.

### Test B: Cross-tenant erişim engeli (1.2 testi)
1. Test A'daki kullanıcı login'liyken adres çubuğuna:
   `http://lvh.me:3000/admin` (default tenant)
2. Beklenen: `/admin/yetkisiz` sayfasına redirect.
3. **"Çıkış Yap"** butonu çalışmalı.

### Test C: Şifre sıfırlama akışı
1. Login sayfasında **"Şifremi Unuttum"** linkine tıkla.
2. `suleymankaraman222+test@gmail.com` gir → **"Sıfırlama Linki Gönder"**.
3. Mail gelmeli (subject Türkçe).
4. Link tıkla → `/admin/davet-kabul#access_token=...&type=recovery`
5. **"Yeni Şifre Belirleyin"** sayfası açılmalı (başlık recovery için).
6. Yeni şifre belirle → tenant admin'e yönlen.
7. Yeni şifreyle login ol → çalışmalı.

### Test D: Login olmayan kullanıcı
1. Incognito → `http://lvh.me:3000/admin`
2. Beklenen: `/admin/giris?next=/admin`

### Test E: Yetkisiz sayfası direkt erişim
1. Incognito → `http://lvh.me:3000/admin/yetkisiz`
2. Sayfa açılmalı (guard yok).
3. **"Çıkış Yap"** → `/admin/giris`

### Test F: Süper admin her tenant'a erişim
1. Süper admin ile login.
2. `http://lvh.me:3000/admin` → açılır.
3. `http://test-acme.lvh.me:3000/admin` → açılır (bypass).
4. Her ikisinde de sidebar görünür, verileri yüklenir.

### Build doğrulaması
```bash
npm run build
```
0 error, 0 warning olmalı.

---

## 6. (Opsiyonel) Email Provider — Default Supabase

Şu an default Supabase email provider yeterli (volume düşük, ayda 5-10
mail). Eğer ileride email gönderim limiti aşılırsa Resend SMTP entegre
edilebilir. Sprint 1 için gerek yok.

---

# Sprint 1 Madde Bazlı Notlar (Geçmiş)

Aşağıdaki bölümler her sprint maddesinin uygulaması sırasında oluşturulan
notların orijinal halidir. Toplu liste yukarıda — burası history için.

---

## Sprint 1 / Madde 1.1 + 1.2 — Şema ve RLS

Bu maddelerin uygulaması tamamlandı ama Supabase Dashboard'dan elle
yapılması gereken iki adım var:

### Migration 011 ve 012 Uygulanması

`supabase/migrations/011_schema_cleanup.sql` ve
`supabase/migrations/012_tenant_aware_rls.sql` Supabase SQL Editor'dan
sırayla çalıştırılmalı. `013_revert_tenant_aware_rls.sql` rollback dosyası
repo'da hazır durur, otomatik uygulanmaz.

### 010_super_admin.sql — Süper Admin İşaretleme

Süper admin yapılacak kullanıcılar için elle SQL çalıştırılır:

```sql
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                          || '{"is_super_admin": true}'::jsonb
WHERE email = 'KULLANICI@ORNEK.COM';
```

---

## Sprint 1 / Madde 1.3 — Davet Kabul Akışı

Madde özel notları yukarıdaki "1. Redirect URLs Whitelist" ve "2. Invite
User Email Template" bölümlerinde toplandı.

### Kodla İlgili Notlar
- `inviteUserByEmail` çağrılarına `redirectTo` parametresi eklendi
  (`src/app/api/super-admin/create-tenant/route.ts`,
  `src/app/api/super-admin/tenant-users/route.ts`).
- Davet kabul sayfası: `src/app/admin/davet-kabul/page.tsx` (Client
  Component, hash fragment'ten session açar).
- Middleware `/admin/davet-kabul` exception eklendi
  (`src/middleware.ts:ADMIN_PUBLIC_PATHS`).

---

## Sprint 1 / Madde 1.4 — Şifre Sıfırlama Akışı

Madde özel notları yukarıdaki "1. Redirect URLs Whitelist" ve "3. Reset
Password Email Template" bölümlerinde toplandı.

### Kodla İlgili Notlar
- Login sayfasına `/admin/sifremi-unuttum` linki eklendi.
- `/admin/sifremi-unuttum` sayfası: `resetPasswordForEmail` çağrısı.
- `/admin/davet-kabul` sayfası `type=invite` ve `type=recovery` ortak
  desteği için mode-aware hale getirildi (hash'ten type okunur).
- Middleware `/admin/sifremi-unuttum` exception eklendi.

---

# Sprint 1 Sonrası Test Gözlemleri (12-13 Mayıs 2026)

Sprint 1 toplu testleri sırasında yakalanan, Sprint 1 kapsamı dışında
ama ileride değerlendirilmesi gereken gözlemler.

## 1. Login Sayfası Tenant-Aware Değil

**Sorun:** /admin/giris sayfasının başlığı her tenant'ta "Sendika Adı"
yazıyor, gerçek tenant adı gözükmüyor. Email placeholder da
"admin@sendika.org.tr" sabit.

**Etki:** Düşük (işlevsel bir sorun yok, sadece UI). Tenant admin'leri
"yanlış yere geldim mi?" diye kafa karışıklığı yaşayabilir.

**Çözüm:** Login sayfasına server-side tenant resolution ekle, başlık
ve placeholder'ı dinamik göster.

**Önerilen sprint:** Sprint 2 — yeni madde 2.5 olarak eklenebilir,
çünkü diğer Sprint 2 maddeleri (sitemap tenant-aware, is_active
fallback) de tenant context revizyonu içeriyor.

## 2. Yetim User Temizleme — Öncelik Artırılmalı

**Sorun:** Bir tenant silindiğinde tenant_users cascade ile gidiyor
ama auth.users'taki kullanıcı yetim kalıyor. Test sırasında bu durum
"davet maili gönderilemiyor" hatasına yol açtı çünkü sistem
"kullanıcı zaten var" deyip yeni davet göndermedi.

**Mevcut plan:** Sprint 3 madde 3.1 (Kullanıcıyı Tamamen Sil Cascade)
bu sorunu çözüyor.

**Öneri:** Sprint 3.1'in önceliği yüksek tutulmalı. Sprint 2 sırasında
yeni tenant test ederken yine aynı sorun çıkacak — manuel olarak
Supabase Dashboard → Authentication → Users'tan elle silmek gerekiyor.

## 3. Süper Admin Cross-Subdomain One-Click Login (Opsiyonel)

**Gözlem:** Süper admin Test Acme tenant'ına gitmek için
test-acme.lvh.me'de tekrar login olmak zorunda kaldı. Cookie scope
subdomain-isolated olduğu için bu doğru davranış (güvenlik açısından
istenen). Ama UX iyileştirme alanı var.

**Olası çözüm:** Süper admin tenant listesinden bir tenant seçince,
arka planda Supabase admin API ile kısa süreli token oluşturup yeni
sekmeye otomatik login. Stripe Connect "View as customer" pattern'i.

**Önerilen sprint:** Sprint 3 civarı veya sonrası. Bu opsiyonel bir
QoL iyileştirme, Sprint planına dahil değil. Cookie scope mimarisi
korunmalı.

## 4. Test Sırasında Email Rate Limit

**Gözlem:** Supabase default email provider saatte ~3-4 mail
gönderiyor. Sprint 1 testleri sırasında 5. mail'de rate limit'e
takıldık (30-60 dk bekleyince çözüldü).

**Etki:** Şu an düşük. Production'da abi domain getirip gerçek
müşteriler eklenmeye başlanınca büyüyebilir.

**Çözüm (opsiyonel):** Resend SMTP entegrasyonu. Ücretsiz tier ayda
3000 mail. Sprint 1 için gerek görülmedi, ileride volume artarsa
düşünülecek.

---

## Sprint 2 / Madde 2.5 — Tamamlandı (18 Haziran 2026)

Login + şifremi-unuttum sayfaları tenant-aware yapıldı (hybrid pattern).

### Kalan benzer durumlar (Sprint 2 sonrası değerlendir)

Provider ağacı dışında kalan diğer sayfalar:

- /admin/yetkisiz — başlığı "Yetkisiz Erişim", generic. Tenant adı
  eklemek kullanıcıya hangi tenant'a girmeye çalıştığını gösterir
  ama info disclosure riski olabilir (yetkisiz kullanıcı tenant
  varlığını öğrenir). UX kararıdır.
- /admin/davet-kabul — başlığı "Şifrenizi Belirleyin" / "Yeni Şifre
  Belirleyin", generic. Tenant adı eklemek kullanıcıya hangi
  kuruluşa davet edildiğini gösterir, faydalı olabilir. Login
  pattern'i ile aynı hybrid yaklaşım kullanılarak düzeltilebilir.

Bu ikisinin öncelik değerlendirmesi UX/security tradeoff içerir,
ayrı bir karar gerektirir.

---

## Sprint 2 / Madde 2.3 — Tamamlandı (18 Haziran 2026)

is_active=false tenant fallback eklendi. Pasif tenant artık default'a
düşmüyor, ayrı "kapalı" sayfası gösteriyor.

### Elle Uygulanması Gereken Migration

`supabase/migrations/014_protect_default_tenant.sql` Supabase SQL
Editor'dan çalıştırılmalı. Default tenant'ın kazara pasiflenmesini
engelleyen trigger ekler. (Bu dosya OLUŞTURULDU ama Supabase'e
UYGULANMADI — elle çalıştırılmalı, 011/012/013 gibi.)

### Sprint 2.3 Sonrası Kapsam-Dışı Bulgular

Madde 2.3 teşhis raporunda yakalandı, ayrı maddeler:

1. **Sitemap pasif tenant exclude** (Sprint 2.1 — sıradaki)
   src/app/sitemap.ts pasif tenant URL'lerini hâlâ listeliyor. Ayrıca
   sitemap tenant-scope'suz (tüm tenant'ların içeriğini tek BASE_URL
   ile listeliyor).

2. **Custom domain server-side resolution kırık** (Sprint 3.4)
   getTenantFromHostname server'da hiç çağrılmıyor — custom domain'li
   tenant'lar default'a düşüyor. Sprint 3.4'te custom_domain matching
   middleware'e taşınacak.

3. **useTenant duplication tam refactor** (Sprint 3.3)
   extractSlugFromHostname 3 yerde kopya (middleware, tenant.ts,
   useTenant.tsx). Madde 2.3'te sadece is_active davranış hizalaması
   yapıldı, tam refactor Sprint 3.3'te.

4. **HTTP 503 yerine 200 + noindex**
   Pasif tenant sayfaları noindex meta tag ile dönüyor ama HTTP status
   200. İdeal: 503 Service Unavailable. Layout'tan 503 döndürmek zor
   (notFound 404 verir). Middleware rewrite gerekir, scope büyük.
   SEO baskısı olursa ayrı bir maddede ele alınacak.

---

## Sprint 2 / Madde 2.1 — Tamamlandı (21 Haziran 2026)

Sitemap ve robots tenant-aware yapıldı. Her tenant kendi
subdomain/custom_domain'inde doğru BASE_URL ile sitemap üretir,
sadece kendi içeriğini listeler.

### Mimari Notlar

- `src/lib/tenant-url.ts` yeni helper (server-safe). buildTenantAdminUrl
  (utils.ts) client-only (window kullanır), buildTenantPublicUrl ise
  server için ayrı tutuldu (window bağımlılığı yok). Apex kaynağı:
  NEXT_PUBLIC_SITE_URL parse edilir (yeni env eklenmedi).
- `export const dynamic = "force-dynamic"` sitemap.ts ve robots.ts'te
  kritik: tenant header'ına (x-tenant-slug) bağlı olduğu için statik
  render edilemez. Olmadan Next.js build-time'da tek statik dosya
  üretip tüm subdomain'lere aynı sitemap'i servis ederdi.
- createAdminClient (RLS bypass) sitemap'te KASITLI korundu, ama
  manuel `.eq("tenant_id")` filtresi her sorguya eklendi. Sprint 1
  tenant-aware RLS bu yüzden sitemap'i korumuyor — manuel filter
  güvenlik katmanı.
- Pasif tenant: sitemap boş urlset (`[]`, DB'ye gitmeden early return),
  robots `disallow: "/"` (tüm site noindex).

### Kapsam-Dışı Bulgular (Sprint 3+)

1. **Custom domain'den direkt erişim** — Sprint 3.4'e bırakıldı.
   Ziyaretçi `https://customdomain.com/sitemap.xml` direkt açarsa
   middleware extractSlugFromHostname "default" döndürüyor, yanlış
   tenant çözülür. Subdomain ({slug}.apex) erişimi çalışır;
   buildTenantPublicUrl DB'deki tenant.custom_domain'i okuyarak doğru
   URL üretir, asıl kırık olan middleware'in hostname→slug eşlemesi.

2. **utils.ts'te buildTenantAdminUrl / tenant-url.ts'te
   buildTenantPublicUrl ayrımı** — Server vs client helper'lar farklı
   dosyalarda. İleride server-side admin URL ihtiyacı doğarsa
   tenant-url.ts'e taşınabilir.

---

## Sprint 2 / Madde 2.2 — Tamamlandı (21 Haziran 2026)

board_members ve branches tablolarının slug UNIQUE kısıtları
tenant-scoped composite'e çevrildi.

### Elle Uygulanması Gereken Migration

`supabase/migrations/015_composite_unique_board_branches.sql`
Supabase SQL Editor'dan çalıştırılmalı (011/012/013/014 gibi).
(Bu dosya OLUŞTURULDU ama Supabase'e UYGULANMADI — elle çalıştırılmalı.)

### Mimari Notlar

- Migration 009 §6 slug UNIQUE'leri composite'e çevirirken
  `board_members` ve `branches` tablolarını atladı — onlar 003'te
  ayrı partial unique index olarak eklenmişti (`board_members_slug_unique`,
  `branches_slug_unique`), 009 sadece 001'deki tablo tanımlarındaki
  constraint'leri ele aldı. 015 bu migration 009'un eksik kalan
  parçasını tamamlar.

- Partial UNIQUE INDEX kullanıldı (constraint değil), çünkü slug
  nullable. Plain CONSTRAINT WHERE koşulu kabul etmez. 003'ün partial
  desenini (WHERE slug IS NOT NULL) koruyarak (slug girilmemiş kayıtlara
  izin) tenant-scoped benzersizlik sağlıyor.

- Kod değişikliği GEREKMEDİ:
  * Slug üretimi (createSlug, finalSlug || null) aynı
  * Duplicate check kodu (23505 yakalama) aynı — composite index yine
    aynı tenant içindeki çakışmayı yakalar
  * CRUD operasyonları zaten .eq("tenant_id", tenant.id) kullanıyor
  * Frontend hata mesajları aynı

### Rollback Dosyası

`016_revert_composite_unique_board_branches.sql` repo'da hazır
ama otomatik uygulanmaz. Geri alma öncesi cross-tenant duplicate
kontrolü zorunlu (dosyanın başında detaylı not var).

### Sprint 2 Sonrası Hatırlatma

Diğer tüm slug/key tabloları (news, announcements, pages,
news_categories, site_settings, tenant_users) zaten tenant-scoped
(009 §6/§7'de yapıldı). `tenants` tablosunda slug + custom_domain
KASITLI global unique (subdomain/domain global benzersiz olmalı).

---

## Sprint 2 / Madde 2.4 — Tamamlandı (23 Haziran 2026)

Storage tenant prefix + RLS uygulaması tamamlandı. 3 alt aşama:

### Aşama 1 — Kod
- `src/lib/storage.ts` yeni helper (`buildStoragePath` + `generateFileName`)
- Upload component'leri revize: ImageUploader, MediaUploader, MediaSection,
  RichTextEditor, galeri/[id]/page.tsx
- Yeni yüklemeler `{tenant_id}/{eski_folder}/{filename}` formatında iniyor

### Aşama 2 — Migration script
- `scripts/migrate-storage-prefix.mjs` (dry-run + manifest desteği,
  bağımsız .env.local loader — dotenv paketi gerekmez)
- Mevcut prefix'siz dosyalar default tenant'a göç edilir
- Eski dosyalar SİLİNMEZ (rollback emniyeti, manifest dosyasında)
- DB göçü: direct URL kolonları + HTML içerik (`content`) + site_settings
- `package.json`: `migrate:storage:dry` ve `migrate:storage` scriptleri

ÇALIŞTIRMA SIRASI (Süleyman, elle):
```bash
npm run migrate:storage:dry    # önce ön-izleme
npm run migrate:storage        # sonra gerçek göç
```

### Aşama 3 — RLS

#### Elle Uygulanması Gereken Migration

`supabase/migrations/017_storage_tenant_rls.sql` Supabase SQL Editor'dan
çalıştırılmalı (011/012/.../015 gibi). Bu dosya OLUŞTURULDU ama Supabase'e
UYGULANMADI.

⚠️ **KRİTİK SIRALAMA:** 017'den **ÖNCE** Aşama 2 script'i (gerçek göç)
mutlaka çalıştırılmalı. Aksi takdirde prefix'siz eski dosyalara write/
update/delete erişimi kırılır.

Policy değişikliği (`storage.objects`):
- ESKİ: 4 generic policy (her authenticated kullanıcı tüm dosyalara erişir)
- YENİ: 4 tenant-scoped policy
  - `images_public_read` — SELECT, anon dahil herkes (site görselleri için)
  - `images_tenant_insert` / `_update` / `_delete` — sadece kendi
    `{tenant_id}/...` prefix'i
- Süper admin `user_has_tenant_access` ile otomatik bypass (012'den)
- Path guard regex (`name ~ '^<uuid>/'`) `::uuid` cast hatasını önler

NOT: 017, `user_has_tenant_access` fonksiyonunu 012'deki SQL tanımıyla
BİREBİR aynı şekilde (LANGUAGE sql, SECURITY DEFINER, `search_path`
sabitli) `CREATE OR REPLACE` eder — sadece varlık garantisi içindir,
mevcut tanımı zayıflatmaz.

#### Rollback

`018_revert_storage_tenant_rls.sql` repo'da hazır. 4 tenant-scoped
policy'i drop edip eski 4 generic policy'i restore eder. Cross-tenant
izolasyon geri alınır. Manuel kullanım; otomatik uygulanmaz.
`user_has_tenant_access` kasıtlı olarak drop edilmez (diğer tablolar
ona bağımlı).

### Kapsam-Dışı Bulgular (Sprint 3+)

1. **Orphan dosyalar** — Storage'da DB referansı olmayan dosyalar var
   (test/silinmiş içerik). Aşama 2 hepsini default tenant'a taşıdı
   (zararsız). Sprint 3'te `.remove()` ile orphan temizliği yapılmalı.

2. **Cleanup adımı** — Aşama 2 eski (prefix'siz) dosyaları Storage'da
   bıraktı. Production'da yeni URL'lerle bir süre (gün/hafta) test edilip
   broken link riski sıfırlandıktan sonra eski dosyalar elle silinmeli
   (ya da script'e `--cleanup` flag eklenebilir, Sprint 3).

3. **Documents bucket** — Kodda kullanılmıyor, Dashboard'da yok. İleride
   PDF/belge yükleme ihtiyacı doğarsa `documents` bucket'ı ayrı policy
   ile (private + signed URL) eklenmeli.
