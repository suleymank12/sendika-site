# Elle Yapılacak İşler

Bu dosya, kod tarafında otomatize edilemeyen ama Supabase Dashboard veya
başka panellerden elle yapılması gereken adımları toplar.

---

# 🔴 GÜVENLİK — K1: Süper admin yetkisi super_admins tablosuna taşındı

**Durum:** Kod + migration hazır, **SQL elle apply edilmeli.** Deploy blokeri.

## Açık neydi?

`is_super_admin` (010) yetkiyi `auth.users.raw_user_meta_data` alanından
okuyordu. Bu alan = `user_metadata` = **kullanıcının kendisi yazabilir**:

```js
await supabase.auth.updateUser({ data: { is_super_admin: true } })
```

Yani herhangi bir tenant admini tek istekle süper admin olabiliyordu →
`user_has_tenant_access` her tenant için TRUE → tüm kuruluşların tüm
verisine sınırsız erişim + tüm süper admin endpoint'leri.

**Canlı DB doğrulaması (apply öncesi):** Tek süper admin vardı
(`suleymankaraman222@gmail.com`), açık **sömürülmemişti**, fonksiyon repo
ile aynıydı (drift yok).

## Çözüm

`supabase/migrations/022_super_admins.sql` — yetki kaynağı
`public.super_admins` tablosuna taşındı. Tablo **RLS açık + policy YOK**
(021'deki `contact_rate_limit` deseni) → anon/authenticated erişemez;
`is_super_admin` SECURITY DEFINER olduğu için RLS'i bypass ederek okur.

**Fonksiyon imzası korundu** (`is_super_admin(user_id UUID) → BOOLEAN`) →
10 TS RPC çağrısı ve ~28 RLS policy dokunulmadan çalışır. Sadece gövde
değişti. Ayrıca `SET search_path = public` eklendi (010'da eksikti) ve
`anon` EXECUTE izni kaldırıldı.

## ⚠️ APPLY SIRASI (bu sıra bozulursa süper admin panelden kilitlenir)

Migration tek transaction: tablo **önce** dolar, fonksiyon **sonra** değişir
→ yetkisiz kalınan an oluşmaz. Yine de adımları sırayla doğrulayın:

1. **Migration'ı çalıştır:** `022_super_admins.sql` (Supabase SQL Editor).
2. **Doğrula** — dosya sonundaki (a)-(e) sorguları. Özellikle **(b)**:
   ```sql
   SELECT public.is_super_admin('00000000-0000-0000-0000-000000000000'::uuid);
   -- MUTLAKA false dönmeli. true dönerse parametre gölgeleme hatası var
   -- (herkes süper admin olur) → hemen rollback.
   ```
3. **Test:** süper admin ile giriş → `/super-admin` açılıyor mu, tenant
   listesi geliyor mu, bir tenant'ın `/admin` paneline bypass ile
   girilebiliyor mu, tenant düzenleme kaydediliyor mu.
4. **Sömürülemezlik testi:** normal bir tenant admini konsolda
   `await supabase.auth.updateUser({ data: { is_super_admin: true } })`
   çalıştırsın → `/super-admin`'e **hâlâ girememeli**. Açığın kapandığının
   kanıtı budur.
5. **Testler geçince eski bayrağı temizle** (bu adımdan sonra rollback
   çalışmaz):
   ```sql
   UPDATE auth.users
   SET raw_user_meta_data = raw_user_meta_data - 'is_super_admin'
   WHERE raw_user_meta_data ? 'is_super_admin';
   ```

**Rollback** (yalnızca adım 5'ten önce): migration dosyasının sonundaki
ROLLBACK bloğu.

## Yeni süper admin ekleme (010'daki YÖNTEMİN YERİNE)

```sql
INSERT INTO public.super_admins (user_id, note)
SELECT id, 'gerekce / kim ekledi'
FROM auth.users
WHERE email = 'KULLANICI@ORNEK.COM'
ON CONFLICT (user_id) DO NOTHING;
```

Kaldırma: `DELETE FROM public.super_admins WHERE user_id = '<uuid>';`
Listeleme:
```sql
SELECT sa.user_id, u.email, sa.note, sa.created_at
FROM public.super_admins sa JOIN auth.users u ON u.id = sa.user_id;
```

⛔ **`user_metadata`'ya bir daha ASLA yetki yazmayın.** 010'daki eski
`UPDATE auth.users SET raw_user_meta_data ...` yöntemi güvenlik açığıdır.

## Kod tarafı değişikliği

`src/lib/super-admin/cleanup-orphan-user.ts` — süper admin tespiti artık
`is_super_admin` RPC'si ile yapılıyor (eskiden `user_metadata`/`app_metadata`
okuyordu; herkes kendini "silinemez" yapabiliyordu). Fail-closed korundu:
RPC hata verirse kullanıcı silinmez. `getUserById` çağrısı kaldırıldı
(yalnızca bu kontrol için yapılıyordu → bir Auth API çağrısı tasarrufu).

---

# 🟠 GÜVENLİK — Y1 / Parça A: Taslak medya sızıntısı kapatıldı

**Durum:** Migration hazır, **SQL elle apply edilmeli.** Kod değişikliği YOK.

## Açık neydi?

`gallery_images` ve `content_media` public SELECT politikaları `USING (true)`
idi. Anon anahtarla (JS bundle'ında, gizli değil) REST üzerinden **tüm
kuruluşların yayınlanmamış** içeriğinin görsel URL'leri çekilebiliyordu —
basın öncesi duyuru, hazırlanan haber, yayınlanmamış albüm fotoğrafları.
Storage bucket'ı public-read olduğu için URL = erişim.

## Çözüm

`supabase/migrations/023_public_policy_publish_scope.sql` — iki tablonun da
kendi yayın kolonu olmadığı için politikalar **parent'ın yayın durumuna**
bağlandı:

- `gallery_images` → `gallery_albums.is_published` (gerçek FK: `album_id`)
- `content_media` → polimorfik parent, 4 yönlü `CASE`:
  `news`/`announcement`/`page` → `is_published`, `headline` → `is_active`,
  tanınmayan değer → `false` (güvenli varsayılan)

**Kod değişmedi** — public sayfalar zaten parent'ı yayın filtresiyle
doğrulayıp sonra medyayı çekiyor. Yayınlanmış içerik aynen çalışır.

**Tenant admin görünürlüğü değişmedi:** `tenant_gallery_images_all` ve
`tenant_content_media_all` politikaları korundu; Postgres permissive
politikaları OR'ladığı için admin kendi taslaklarını görmeye devam eder.

## Apply + doğrulama

1. `023_public_policy_publish_scope.sql` çalıştır (SQL Editor).
2. Dosya sonundaki (a)–(e) doğrulamaları çalıştır. Özellikle **(d)**:
   yayınlanmamış bir albümün fotoğrafları `SET LOCAL ROLE anon` altında
   **0** dönmeli.
3. Regresyon testi (incognito): `/galeri`, `/galeri/<id>`,
   `/haberler/<slug>`, `/duyurular/<slug>`, `/sayfa/<slug>` — galeriler
   geliyor mu. Admin panelde taslakların galerisi hâlâ görünmeli.

Rollback: dosya sonundaki ROLLBACK bloğu (sızıntıyı geri açar).

## Y1'in KALAN parçası (Parça B — ✅ TAMAMLANDI, 27 Temmuz 2026)

Aşağıdaki **"🟠 GÜVENLİK — Y1 / Parça B"** bölümüne bakın. Kod değişikliği
yapıldı (5 public sayfa service-role'e taşındı, iki sessiz regresyon
`.eq("is_active", true)` ile kapatıldı), migration 024 hazır — **kod
deploy edildikten SONRA elle apply edilmeli.**

---

# 🟠 GÜVENLİK — Y1 / Parça B: board_members + branches anon erişimi kapatıldı

**Durum:** Kod değişikliği tamamlandı (27 Temmuz 2026), migration 024 hazır.
**SQL elle apply edilmeli — AMA kod deploy edildikten SONRA.**

## Açık neydi?

`board_members` ve `branches` public SELECT policy'leri tenant-agnostic
idi (001:184-188, `USING (is_active = true)` — tenant filtresi yok). Anon
anahtarla REST üzerinden **tüm kuruluşların** yönetim kurulu üyeleri +
şube yöneticilerinin **ad + e-posta + telefonu** tek istekte
toplanabiliyordu — Y1'in asıl KVKK riski.

## Çözüm (iki adım — SIRA KRİTİK)

1. **Kod (yapıldı):** board_members/branches okuyan 5 public sayfa anon
   server client'tan `createAdminClient`'a (service role) taşındı —
   sitemap.ts deseni. 11 public sorgunun 11'inde `.eq("tenant_id")` zaten
   vardı; RLS'in sessizce uyguladığı `is_active = true` koşulu eksik olan
   2 sorguya eklendi:
   - `subeler/[slug]/page.tsx` board_members sorgusu (pasif yönetici
     public'te görünürdü)
   - `subeler/[slug]/yonetici/page.tsx` board_members redirect sorgusu
     (çalışan sayfa 404 olurdu)
2. **DB:** `supabase/migrations/024_drop_public_pii_policies.sql` —
   `"Public: board_members select"` + `"Public: branches select"` DROP.
   `tenant_board_members_all` + `tenant_branches_all` (admin panel)
   KORUNUR.

## ⚠️ APPLY SIRASI (bozulursa public sayfalar kırılır)

1. **ÖNCE** kod değişikliği commit + deploy (service-role'e geçmiş olmalı).
2. **SONRA** `024_drop_public_pii_policies.sql` (Supabase SQL Editor).

Ters sıra: policy DROP'lanır ama kod hâlâ anon client kullanır → public
yönetim-kurulu/şubeler sayfaları boş döner. (Lokalde ikisi aynı anda
test edilebilir; production'da sıra önemli.)

## Test

Kod sonrası (policy DROP'tan önce de çalışır):
- incognito → `/kurumsal/yonetim-kurulu`, `/yonetim-kurulu/<slug>` (e-posta
  + telefon dahil), `/subeler`, `/subeler/<slug>`, `/subeler/<slug>/yonetici`
- Bir yöneticiyi pasif işaretle → public'te GÖRÜNMEMELİ (regresyon testi)

Policy DROP sonrası: 024 dosya sonundaki (a)–(d) doğrulamaları. Özellikle
(c) curl testi: anon key ile `board_members`/`branches` sorgusu **[]**
dönmeli (cross-tenant sızıntının kapandığının kanıtı).

Rollback: 024 dosya sonundaki ROLLBACK bloğu (sızıntıyı geri açar).

---

# 🟠 MIGRATION 025 — homepage_sections drift'i kapatıldı (29 Temmuz 2026)

**Durum:** Migration hazır, **SQL elle apply edilmeli.** Mevcut canlı DB'de
veri kaybı/davranış değişikliği YOK; asıl amacı **sıfırdan kurulan DB'lerin**
(yeni müşteri projesi) çalışması.

## Sorun neydi? (Tur 2 performans denetimi, bulgu b5)

`homepage_sections` + `homepage_section_items` tabloları Supabase
Dashboard'da elle yaratılmıştı — repo'da CREATE TABLE'ları yoktu (009:19-21
bunu belgeliyordu; çalıştırılan DDL `admin/anasayfa-bolumleri/page.tsx:1-33`
yorumunda duruyordu). Sıfırdan kurulan DB'de 005 (icon kolonu) ve 012
(policy) hata veriyor, anasayfa bölümleri hiç çalışmıyordu.

## Çözüm

`supabase/migrations/025_homepage_sections.sql` — canlı DB'deki gerçek şema
(PostgREST OpenAPI'den okundu) birebir repo'ya alındı. 019'daki
content_media emsalinin aynısı: CREATE TABLE IF NOT EXISTS + ADD COLUMN
IF NOT EXISTS + CREATE INDEX IF NOT EXISTS + DROP POLICY IF EXISTS →
CREATE POLICY. **Tamamen idempotent.**

Canlı DB'de tek görünür değişiklik: public policy İSİMLERİ Dashboard'daki
"Public read active sections/section items"tan repo standardına
(`homepage_*_public_read`) geçer. Predicate aynen `is_active = true` kalır
— erişim ne genişler ne daralır.

## Apply + doğrulama

1. `025_homepage_sections.sql` çalıştır (Supabase SQL Editor).
2. Dosya sonundaki (a)–(e) doğrulamaları çalıştır — özellikle (d): anon
   rolüyle yalnızca aktif satırlar dönmeli.
3. Regresyon: public anasayfa bölümleri + `/bolum/[id]` + admin "Anasayfa
   Bölümleri" (listeleme/ekleme/silme).

## ⚠️ Sıfırdan kurulum sırası (yeni müşteri projesi açarken)

Migration'lar sırayla uygulanırken 025, **004'ten sonra (005'ten önce) BİR
KEZ erken** çalıştırılmalı, sırası geldiğinde normal şekilde TEKRAR
çalıştırılmalı (ikisi de güvenli — idempotent). Erken koşumda tenants
tablosu henüz olmadığı için tenant_id/tenant-policy blokları NOTICE ile
atlanır; 009 ve 012 sırası gelince tamamlar.

Rollback: dosya sonundaki blok (yalnızca policy isimlerini geri alır —
tablolar migration'dan önce de vardı, DROP TABLE bilerek dahil değil).

---

# 📦 VPS DEPLOY ADIMLARI (Tur 2 / a2 — 29 Temmuz 2026)

Hedef: isimtescil VDS-Eko, **1 core / 2 GB RAM / 20 GB SSD**. Bu bölüm
repo tarafı hazırlanırken yazıldı; sunucu alınınca sırayla uygulanacak.

## 1. Build LOKALDE veya CI'da alınır — sunucuda ASLA

`next build` tepe noktada 1.5-2+ GB RAM ister; 2 GB / 1 core sunucuda OOM
ya da saatlerce swap demektir. Sunucuya yalnızca build ÇIKTISI kopyalanır.

⚠️ **Platform uyumu:** standalone çıktının içindeki node_modules (özellikle
sharp'ın native binary'si) build alınan platforma özgüdür. **Windows'ta
alınan build Linux VPS'te ÇALIŞMAZ.** Build şunlardan biriyle alınmalı:
- WSL (Ubuntu) içinde `npm ci && npm run build`, veya
- CI (GitHub Actions ubuntu-latest), veya
- `npm install --os=linux --cpu=x64 sharp` ile cross-install (sharp
  0.33+ destekler) + Windows'ta build — EN SON çare, WSL/CI tercih edilir.

## 2. Standalone çıktı + ELLE kopyalanacak klasörler

`next.config.mjs` → `output: "standalone"` aktif. `next build` sonrası:

```
.next/standalone/          ← server.js + trace edilmiş node_modules (bunu kopyala)
.next/static/              ← OTOMATIK DAHİL DEĞİL → .next/standalone/.next/static/ altına kopyala
public/                    ← OTOMATIK DAHİL DEĞİL → .next/standalone/public/ altına kopyala
```

Kopyalama (build makinesinde):
```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
```
Sonra `.next/standalone/` içeriği sunucuya rsync'lenir. Çalıştırma:
`node server.js` (PORT ve HOSTNAME env ile). `.env` PRODUCTION değerleriyle
sunucuda ayrıca oluşturulmalı (standalone .env.local taşımaz).

## 3. Sunucu hazırlığı (2 GB gerçeği)

- **2 GB swap aç** (güvenlik ağı — build için değil, runtime tepeleri için):
  `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` + fstab satırı.
- **Tek Node prosesi:** 1 core'da PM2 cluster ANLAMSIZ — `pm2 start server.js -i 1`
  veya systemd unit. Restart-on-crash yeterli.
- **Nginx önde:** TLS + gzip + `/_next/static` için uzun Cache-Control.
  HSTS Nginx'te set edilecek (next.config'te bilerek yok — NOTE'taki CSP
  bölümüne bakın).

## 4. sharp doğrulaması (görsel optimizasyonu)

`sharp` artık dependency (package.json). Next 14.2 production'da sharp
yoksa WASM squoosh'a düşer: yavaş + bellek-tepeli → 2 GB'da OOM riski.
Deploy sonrası doğrula:
```bash
node -e "console.log(require('sharp').versions)"   # standalone dizininde
```
Ayrıca `node server.js` loglarında "sharp" uyarısı OLMAMALI. next/image
varyantları `.next/cache/images`'ta birikir — disk yeterli (20 GB), ama
`.next/cache` rsync'e dahil edilmemeli (her deploy'da sıfırlanması sorun
değil, yeniden üretilir).

## 5. Deploy sonrası ilk hafta işleri (Tur 2 teşhisinden — sırayla)

- b1: Admin listelerine kolon listesi + pagination + arama debounce
- b2: Detay sayfalarında bağımsız sorguları Promise.all'a alma
- b3: Chrome sorgularına tenant-keyed unstable_cache (60 sn TTL) — tasarım
  şartları Tur 2 teşhis raporu madde 6'da (sızıntı riskine dikkat)
- b4: `news`/`announcements` composite index migration'ı +
  `homepage_section_items(section_id)` index'i
- Uptime monitor (Supabase Free 7 gün inaktivite pause + genel sağlık)

---

# 🟠 GÜVENLİK — Y2: Sanitize hattı kapatıldı (28 Temmuz 2026)

**Durum:** ✅ Kod tarafı tamamlandı. **Migration YOK, elle apply YOK.**
Sanitize render anında çalışır; DB'deki mevcut kirli veri de kapsanır.

## Açık neydi?

Tenant admin'lerin girdiği HTML, public sayfalarda **sanitize edilmeden**
`dangerouslySetInnerHTML` ile render ediliyordu (7 sink / 10 render yolu:
news, announcements, pages, headlines içerikleri + `board_members.bio` +
`branches.description` + `branches.manager_bio`). Projede sanitize
kütüphanesi yoktu.

Zincir: kötü niyetli tenant admin içeriğe script gömer → o origin'de
oturumu olan kullanıcının Supabase auth token'ı sızar. Token JS'ten
okunabilir bir çerezde (`@supabase/ssr` `httpOnly:false` — client-side
auth mimarisinin zorunlu sonucu, yapılandırma hatası değil) ve JWT proje
geneline geçerli olduğundan, süper admin token'ı ele geçirilirse **tüm
tenant'ların verisi** açılır.

**Not:** Çerez host-only'dir (`domain` set edilmiyor). Yani "subdomain'i
ziyaret etmek" tek başına yetmez; kurban o host'ta **login olmuş**
olmalıdır. Gerçekçi iki senaryo:
- **A (en kritik):** `/super-admin` paneli apex'te; apex'in tenant'ı
  `default`. Yani `default` tenant'ın public içeriği süper admin paneliyle
  **aynı origin'de**. → aşağıdaki backlog kaydı.
- **B:** Süper admin, `/super-admin/tenants` sayfasındaki "Admin paneli"
  linkiyle tenant subdomain'ine gidip orada login olur → süper admin JWT'si
  o tenant'ın origin'inde bir çerezde durur.

## Çözüm

Yazma yolunda sanitize **zorlanamaz** (admin panel client-side; kayıtlar
tarayıcıdan doğrudan PostgREST'e gidiyor, kötü niyetli admin kendi
token'ıyla ham HTML yazabilir). Bu yüzden tek zorlanabilir darboğaz olan
**render** anında sanitize edildi.

- `src/lib/sanitize.ts` — `sanitizeContentHtml()`, `sanitize-html` tabanlı
  katı allow-list. Kaynak: Tiptap'in (StarterKit v3 + Underline + Link +
  Image + TextAlign) üretebildiği HTML kümesi. `style` yalnızca
  `text-align`, `code.class` yalnızca `language-*`, şemalar
  http/https/mailto/tel. `import "server-only"` ile client bundle'a
  sızması build hatası verir.
- `src/components/SafeHtml.tsx` — server component. Projedeki **tek**
  meşru `dangerouslySetInnerHTML` kullanıcısı (7 sink → 1).
- `DetailPageLayout` client component olduğu için sanitize edemez;
  `content` prop'u `string` yerine **ReactNode** oldu ve ham HTML sink'i
  bu bileşenden tamamen kaldırıldı.
- `headlines.subtitle` artık HTML string'ine gömülmüyor; ayrı prop olarak
  **düz metin** render ediliyor (alan admin formda zaten düz `<Input>`).
- **Yan fayda:** `img src` yalnızca `*.supabase.co` + göreli kabul ediliyor.
  Yabancı host'lu bir `<img>`, `extractImagesFromHtml` üzerinden
  `next/image`'a düşüp sayfayı 500'e çeviriyordu; o da kapandı.
- `.eslintrc.json` → `react/no-danger: "error"` (override: `SafeHtml.tsx`
  ve `app/layout.tsx`). Regresyon kilidi.

## Bug fix — `<img src="x">` sayfayı 500'e düşürüyordu (28 Temmuz 2026)

Sanitize hattı test edilirken yakalandı. İlk `isAllowedImageSrc`
uygulaması "şemasız ve `//` ile başlamayan **her şeyi**" göreli URL sayıp
kabul ediyordu. Yani `<img src="x">` HTML'de kalıyor →
`extractImagesFromHtml` bunu `next/image`'a veriyor → next/image
`Failed to parse src "x"` ile **çöküyor, sayfa 500**.

İki katman birden düzeltildi (derinlemesine savunma):

- **Kaynak (`src/lib/sanitize.ts`):** `isAllowedImageSrc` sıkılaştırıldı.
  Kabul edilen tek iki biçim: `https://<alt>.supabase.co/...` **veya**
  `/...` (tek eğik çizgi). `x`, `a.jpg`, `./a.png`, `../a.png`,
  `//evil.com/...`, `http://...` (https dışı), `data:`, boş → **tag düşer**.
  `http:` bilinçli olarak kaldırıldı: `next.config.mjs` `protocol: "https"`
  şart koşuyor, http'li bir supabase URL'i de çökertiyordu.
- **Tüketim (`src/lib/utils.ts`):** Yeni `isNextImageSafeUrl()` —
  `next.config.mjs` `images.remotePatterns`'i **birebir** yansıtır
  (https + `*.supabase.co` + pathname `/storage/v1/object/public/`, ya da
  `/` ile başlayan göreli). Asla throw etmez. `extractImagesFromHtml` artık
  bununla filtreliyor; `DetailPageLayout`'ta `photos[]` kurulurken
  **`cover_image` kolonu da** aynı filtreden geçiyor — o kolon ne
  sanitize'dan ne extract'tan geçtiği için bozuk bir değeri aynı 500'ü
  veriyordu.

⚠️ `next.config.mjs` `images.remotePatterns` değişirse `isNextImageSafeUrl`
**da** güncellenmeli (fonksiyonun üstünde uyarı yorumu var). Aksi halde ya
geçerli görsel sessizce kaybolur ya da geçersiz src sayfayı çökertir.

## Test

`npm run test:sanitize` — **65 fixture**, tümü geçiyor:
- (a) XSS vektörleri, (a2) img src kabul kuralı (düşen 8 + korunan 2),
- (b) meşru Tiptap çıktısının korunması, (c) null/idempotent sözleşmesi,
- (d) ikinci katman: `isNextImageSafeUrl` + `extractImagesFromHtml` filtresi.

RichTextEditor extension listesi değişirse **allow-list ve bu fixture'lar
güncellenmelidir**, yoksa meşru içerik sessizce bozulur.

## Kapsam dışı bırakılanlar (ayrı işler)

- **CSP** (nonce tabanlı, middleware'de) — ✅ uygulandı, aşağıdaki bölüme bakın.
- **RichTextEditor temizliği** — ✅ **KAPATILDI (29 Temmuz 2026).**
  StarterKit v3 zaten `Link` ve `Underline` içeriyor; bileşen bunları bir
  kez daha ekliyordu ("Duplicate extension names" uyarısı). Ayrı import'lar
  kaldırıldı, ayar `StarterKit.configure({ link: { openOnClick: false } })`
  olarak taşındı; `@tiptap/extension-link` + `@tiptap/extension-underline`
  package.json'dan da düşürüldü (StarterKit kendi dependency'si olarak
  getiriyor, kurulu sürüm değişmedi — yeniden import edilip aynı sorunun
  geri gelmesine davetiye olmasın diye).

  **Bonus bulgu:** duplicate kayıt yüzünden `openOnClick: false` fiilen
  ÇALIŞMIYORDU — iki `Link` kopyası da click handler kaydediyor, `false`
  olan kopya tıklamayı "handled" saymayınca sıra StarterKit'in
  `openOnClick: true` kopyasına geçiyor ve admin editörde linke tıklamak
  onu yeni sekmede açıyordu. Fix bunu da düzeltti.

  Üretilen HTML byte-for-byte aynı doğrulandı (aynı paket, aynı sürüm,
  aynı varsayılanlar) → sanitize allow-list + fixture'lara dokunulmadı.

---

# 🟠 GÜVENLİK — Y2 / CSP: nonce tabanlı Content-Security-Policy (28 Temmuz 2026)

**Durum:** ✅ **Enforce modunda yayında** (28 Temmuz 2026,
`CSP_REPORT_ONLY = false`). Yeni bir dış kaynak eklenecekse önce
Report-Only'ye dönülmeli (aşağıda).

Sanitize hattının **altına serilen ikinci savunma katmanı**. Sanitize XSS'i
kaynağında öldürür; CSP, sanitize atlanırsa/aşılırsa devreye girer.

## Ne kapsıyor

`src/middleware.ts` her istekte şu CSP'yi üretiyor:

```
default-src 'self';
script-src 'self' 'nonce-{HER ISTEKTE YENI}' 'strict-dynamic';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: https://*.supabase.co;
media-src 'self' https://*.supabase.co;
connect-src 'self' https://*.supabase.co;
frame-src https://www.youtube.com https://www.google.com;
frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none';
```

Kaçınılmaz tavizler ve gerekçeleri:

- **`style-src 'unsafe-inline'` zorunlu.** `(public)/layout.tsx` tenant rengini
  CSS değişkeni olarak `style={{}}` ile basıyor, Swiper runtime'da `transform`
  stili yazıyor, `DetailPageLayout` yazı boyutunu inline veriyor. Inline
  **style**, inline **script**'ten çok daha az tehlikeli.
- **`fonts.googleapis.com` / `fonts.gstatic.com`**: `globals.css:1`'deki
  `@import` derlenmiş CSS'te hayatta kalıyor (Inter fontu). Bunlar olmadan
  site sistem fontuna düşer.
- **`'unsafe-eval'` yalnızca development'ta** (Next HMR `eval` kullanıyor).
  Production'da asla — `process.env.NODE_ENV` ile ayrılmış.
- **`upgrade-insecure-requests` bilerek yok**: lokal http geliştirmeyi bozar,
  HTTPS zorlaması Nginx'in işi.

## Nonce mekanizması (Next 14.2.35'te doğrulandı)

Next, nonce'u **`x-nonce` header'ından okumaz.** İsteğin
`Content-Security-Policy` **veya** `Content-Security-Policy-Report-Only`
header'ından okur (`app-render.js` → `getScriptNonceFromHeader`); `script-src`
direktifindeki `'nonce-…'` değerini alır.

Bu yüzden middleware CSP'yi **hem request hem response** header'ına yazıyor:

| Yer | Neden |
|---|---|
| `requestHeaders.set(...)` (nonce üretiminden hemen sonra) | Next kendi inline bootstrap script'lerine nonce'u buradan basıyor. **Sadece response'a yazmak siteyi tamamen öldürür** — script'ler nonce'suz kalır, tarayıcı hepsini bloklar. |
| `setAll` closure'ı içinde | `setAll` `supabaseResponse`'u **yeniden kuruyor**; bu satır olmadan token yenilenen isteklerde CSP header'ı düşer. `x-tenant-slug` ile birebir aynı tuzak. |
| `auth.getUser()` sonrası | `setAll` hiç tetiklenmediğinde (çerez yenilenmedi) response'a CSP'yi yazan tek yer. |

**Nonce her istekte yeniden üretiliyor** (`btoa(crypto.randomUUID())`). Modül
seviyesinde sabitlenirse CSP'nin XSS koruması tamamen değersizleşir.

## Report-Only → enforce (✅ geçildi, 28 Temmuz 2026)

`src/middleware.ts` başındaki `const CSP_REPORT_ONLY` bayrağı `false`
yapıldı; CSP artık `Content-Security-Policy` header'ı olarak **zorlayıcı**.

Next, Report-Only header'ından **da** nonce okuduğu için nonce mekanizması
enforce'tan önce gerçekten test edilmiş oldu; geçişte sürpriz çıkmadı.

**Enforce kriteri geçişten önce sağlandı — gezinti temiz geçti:**

1. Şu akışların tamamı, tarayıcı konsolunda **tek bir `[Report Only]`
   satırı üretmeden** tamamlandı:
   anasayfa (Swiper slider) · YouTube'lu haber detayı · iletişim + şube detayı
   (Google Maps) · admin giriş → Tiptap editör → **görsel yükleme** (en kırılgan
   akış: `blob:` + `connect-src`) · DevTools Network'te `fonts.gstatic.com`
   isteği **200** döndü (blocked değil).
2. Sayfa kaynağında Next'in inline script'lerinde `nonce="…"` görüldü ve
   **her yenilemede değişti**.

**Enforce sonrası doğrulama sonuçları:**

- Production build'de **`'unsafe-eval'` yok** (yalnızca development/HMR'de).
- **22/22 inline script nonce'lu**; nonce **istek başına değişiyor**.
- **9 rota 200** dönüyor (public + admin akışları kırılmadı).

## ⚠️ Yeni dış kaynak eklerken: önce Report-Only'ye geri dön

Siteye yeni bir dış kaynak eklenirse (analytics, CDN, üçüncü parti embed,
Supabase Realtime `wss://` vb.) enforce modundaki CSP onu **bloklar**.
Prosedür:

1. `src/middleware.ts` → `CSP_REPORT_ONLY = true` (Report-Only'ye dön).
2. İlgili CSP direktifine yeni kaynağı ekle.
3. Yukarıdaki gezinti akışlarını (1) ve nonce kontrolünü (2) **tekrarla** —
   konsol temiz geçmeden `CSP_REPORT_ONLY = false` ile enforce'a dönme.

## ⚠️ Realtime eklenirse

`connect-src`'te **`wss://` bilerek yok** — Supabase Realtime (`.channel()`)
şu an kullanılmıyor (tek `subscribe()` `davet-kabul`'daki `onAuthStateChange`,
o websocket açmıyor). İleride `.channel()` kullanılırsa `connect-src`'e
**`wss://*.supabase.co` eklenmelidir**, yoksa realtime sessizce çalışmaz.

## Statik header'lar (`next.config.mjs`)

`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(),
geolocation=()`, `X-Frame-Options: DENY`.

`next.config.mjs`'te duruyorlar ki **hem Vercel'de hem VPS/Nginx arkasında**
otomatik çalışsınlar (taşınabilirlik).

**HSTS bilerek YOK.** `Strict-Transport-Security` deploy'da **Nginx'te** set
edilmeli (`max-age=31536000; includeSubDomains`) — TLS'i sonlandıran katman
orası ve yanlış bir `max-age` geri alınamaz.

## Yan etki: root layout'taki inline script kaldırıldı

`app/layout.tsx`'teki `document.body.classList.add("hydrated")` inline
script'i `src/components/HydrationFlag.tsx` (client component) ile değiştirildi.
Böylece CSP'de inline script istisnası hiç gerekmedi.

Neden root layout'ta: `#initial-loading-bar` açılış spinner'ı root layout'ta,
yani **admin ve super-admin dahil** her sayfada. `PageLoader` ise yalnızca
`(public)/layout.tsx`'te mount ediliyor — script tek başına kaldırılsaydı
admin panelinde spinner ekranda asılı kalırdı. `PageLoader.tsx:13`'teki aynı
çağrı bilinçli olarak duruyor (idempotent, zararsız).

`.eslintrc.json`'daki `react/no-danger` istisnasından `app/layout.tsx`
çıkarıldı — artık tek istisna `SafeHtml.tsx`.

---

# 📋 BACKLOG — `branches.map_url` doğrulanmadan iframe src'ye veriliyor

**Nereden çıktı:** CSP dış kaynak envanteri (28 Temmuz 2026).

**Sorun:** `subeler/[slug]/page.tsx` içindeki `buildMapEmbed`, `branch.map_url`
kolonunu **hiçbir doğrulama yapmadan** `<iframe src>`'e veriyor. Admin formunda
düz metin input (`admin/subeler/page.tsx` → `form.map_url.trim() || null`).

Sonuçları:
- Tenant admin, public şube sayfasına **istediği siteyi** iframe olarak
  gömebilir (phishing).
- `javascript:` şemalı bir değer Chromium'da iframe içinde **üst dokümanın
  origin'inde çalışır** — yani bu bir XSS vektörü.

**Neden Y2 sanitize hattı kapsamadı:** Bu sink `dangerouslySetInnerHTML` değil,
normal bir React prop'u. Sanitize hattı HTML içeriğini temizliyor, JSX
prop'larını değil.

**Şu anki durum (güncellendi, 28 Temmuz 2026):** CSP artık **ENFORCE
modunda** ve `frame-src https://www.youtube.com https://www.google.com`
ikisini de kapatıyor (nonce'lu `script-src` `javascript:` URI'larını da
bloklar) — rastgele iframe gömme **fiilen bloklanıyor**. Ama CSP burada
yara bandı olmaya devam ediyor; **asıl düzeltme (değerin
kaydedilirken/render edilirken doğrulanması) hâlâ yapılmalı.**

**Asıl düzeltme (ayrı iş):** `map_url` değeri kaydedilirken ve/veya render
edilirken doğrulanmalı — yalnızca `https://www.google.com/maps...` biçimine
izin veren bir kontrol. `isNextImageSafeUrl` deseninin aynısı uygulanabilir.

## ✅ KAPATILDI (29 Temmuz 2026)

Doğrulama iki katmanda uygulandı; **zorlanabilir katman render** (Y2
gerekçesi: admin panel client-side, kayıt admin'in kendi token'ıyla doğrudan
PostgREST'e gidiyor → form doğrulaması güvenlik değil, UX katmanı).

Yapılanlar:

- **`src/lib/utils.ts` → `isSafeMapEmbedUrl()`** — `isNextImageSafeUrl`
  deseninin eşi: saf, asla throw etmez, type predicate, allow-list. Kabul
  edilen TEK kaynak: `https` + hostname **tam eşleşme** `www.google.com` +
  (`/maps/embed...` yolu **veya** `/maps` + `output=embed` parametresi).
  Suffix hilesi (`www.google.com.evil.com`), `/maps/place` (embed'lenemez —
  gri "refused to connect" kutusu), kısa linkler (`maps.app.goo.gl`,
  `goo.gl/maps`), `maps.google.com` (CSP frame-src'te yok), `javascript:`,
  `data:`, `http:`, protokol-göreli → hepsi RED. ⚠️ Kural `middleware.ts`
  CSP `frame-src` ile **SENKRON olmalı** — uyarı yorumu iki dosyada da var.
- **`src/lib/utils.ts` → `normalizeMapEmbedInput()`** — YALNIZCA admin form
  kullanır. Google'ın "Haritayı yerleştir" diyaloğu iframe kodunun tamamını
  kopyalattığı için en olası kullanıcı hatası kurtarılır: iframe HTML'inden
  `src` ayıklanır, aynı katı kuraldan geçirilir. DB'ye her zaman **temiz
  URL** yazılır.
- **Render (`subeler/[slug]/page.tsx` → `buildMapEmbed`):** `map_url` artık
  yalnızca doğrulamadan geçerse iframe'e gider; geçmezse **adresten üretilen
  haritaya düşer** (render'da kurtarma YOK — saf doğrulayıcı). Sayfa hiçbir
  durumda yabancı iframe ya da bozuk gri kutu göstermez.
- **Admin form (`admin/(authenticated)/subeler/page.tsx` → `handleSave`):**
  normalize → boş değil ama geçersizse kayıt **ENGELLENİR**, yol gösteren
  Türkçe toast (kısa paylaşım linklerinin çalışmadığı açıkça söylenir).
  Yardım metni güncellendi: iframe kodunun tamamı da yapıştırılabilir.
- **`middleware.ts` frame-src yorumu güncellendi:** birincil savunma artık
  kaynak doğrulaması, CSP ikinci katman.

Mevcut veri uyumu: canlı DB'de 2 şubenin ikisinde de `map_url` NULL —
hiçbir çalışan harita etkilenmedi (ikisi de adres fallback'i kullanıyor;
fallback URL biçimi `/maps?q=...&output=embed` yeni kuralı kendisi de
geçiyor).

Doğrulama: `npm run test:sanitize` → yeni (e) bölümüyle **90 fixture**
geçiyor (22 yeni: kabul 4 + ret 14 + normalize 4); build ve lint temiz.
Canlı sömürülemezlik testi (konsoldan `map_url`'e `https://evil.example` /
`javascript:alert(1)` yazıp public sayfayı kontrol etmek) henüz elle
yapılmadı — K1'deki desenle yapılması önerilir.

---

# 📋 NOT — Kaydedilmemiş değişiklik uyarısının bilinen sınırı (29 Temmuz 2026)

Tur 3 / b2 / P6 ile admin editörlerine (haberler/duyurular/sayfalar
editörleri + ayarlar) kaydedilmemiş değişiklik koruması eklendi:
`DirtyFormProvider` (`src/hooks/useDirtyForm.tsx`) + snapshot
karşılaştırması + Sidebar/AdminHeader geçiş onayı + beforeunload.

**BİLİNEN SINIR — tarayıcı GERİ tuşu korunmaz.** SPA içi geri/ileri
(popstate) App Router'da güvenilir şekilde engellenemez: resmi
navigation-guard API'si yok (pages router'daki `router.events`
kaldırıldı), popstate'i elle engellemek Next'in kendi history
yönetimiyle yarışan kırılgan bir hack. Bilinçli olarak kapsam dışı
bırakıldı. Kapsanan çıkışlar: sekme kapatma/yenileme/harici URL
(beforeunload), Sidebar linkleri + logo + çıkış, AdminHeader
geri/breadcrumb/çıkış, haber editöründeki "Kategoriler sayfasından"
linki. İleride Next resmi bir API sunarsa (`useRouter` interception)
buradan tamamlanabilir.

---

# ✅ KAPATILDI (15 Ağustos 2026) — prose-* sınıfları no-op (Tailwind typography plugin yok)

**Kapanış:** Başlık/strong rengi niyeti `globals.css .prose`'a taşındı
(text-text-dark); çakışan niyetler (margin/ağırlık/link rengi/p rengi)
"mevcut kazanır" kuralıyla bilerek taşınmadı. `prose-lg` → `text-lg`.
Ölü sınıf listeleri temizlendi. Plugin kurulmadı (karar geçerli).

**Nereden çıktı:** Tur 3 UX denetimi / a1 (29 Temmuz 2026). Karar Süleyman
onayıyla verildi (29 Temmuz 2026).

**Durum:** `@tailwindcss/typography` kurulu değil (`tailwind.config.ts:32`
`plugins: []`). Bu yüzden `DetailPageLayout.tsx:207`'deki
`prose-headings/prose-h2/prose-h3/prose-p/prose-a/prose-img/prose-strong`
zinciri ve 3 kurumsal sayfadaki (`hakkimizda`/`misyon-vizyon`/`tuzuk`)
`prose-lg` **HİÇBİR ŞEY YAPMIYOR** — ölü sınıflar.

**Karar: Plugin KURULMAYACAK.** Gerekçe: `globals.css`'te sanitize
allow-list'ine uyarlanmış, çalışan bir özel `.prose` implementasyonu var;
plugin aynı seçicilere ikinci bir kural kümesi bindirir, specificity
çakışmaları öngörülemez görsel regresyon yaratır ve iki stil kaynağı
kalıcı bakım maliyeti demektir.

**Yapılacak (ilk müşteriden önce, ~1-2 saat):** No-op zincirdeki niyeti
(başlık ağırlığı/margin, paragraf satır aralığı, link rengi, img
yuvarlatma) `globals.css .prose`'a taşı; `prose-lg` yerine düz CSS ya da
`text-lg`; sınıf listelerini kısalt. **Görsel karşılaştırma şart** —
içerikli bir haber detayı + 3 kurumsal sayfa öncesi/sonrası yan yana
kontrol edilmeli.

**Not:** Tur 3/a1'deki taşma düzeltmeleri (`.prose` overflow/word-break
kuralları) bu karardan bağımsız çalışıyor — temizlik onlara dokunmayacak.

---

# 📋 BACKLOG — homepage_sections public policy'leri tenant-agnostik

**Nereden çıktı:** Migration 025 hazırlanırken (29 Temmuz 2026, Tur 2 / b5).

**Sorun:** `homepage_sections` + `homepage_section_items` public SELECT
policy'leri tenant-agnostik: `USING (is_active = true)` — tenant filtresi
yok (025'te repo'ya alınan `homepage_*_public_read` policy'leri; canlıdaki
Dashboard policy'lerinin birebir devamı). Y1'deki board_members/branches
deseninin aynısı: anon anahtarla REST üzerinden **tüm kuruluşların**
anasayfa bölümleri tek istekte okunabiliyor.

**Risk seviyesi:** Düşük — **PII YOK** (başlık, açıklama, görsel/link
URL'i). KVKK riski değil; cross-tenant **yapı sızıntısı** (bir kuruluşun
anasayfa kurgusu/kampanya linkleri dışarıdan toplanabilir). Y1'in aksine
acil değil, bu yüzden 025 kapsamına bilinçli alınmadı — 025 canlı
davranışı birebir korur, erişimi ne genişletir ne daraltır.

**Çözüm (Y1 Parça B ile aynı desen, ayrı iş):**
1. Public sayfalardaki `homepage_sections`/`homepage_section_items`
   sorgularını (`(public)/page.tsx`, `(public)/bolum/[id]/page.tsx`)
   anon client'tan `createAdminClient`'a (service role) taşı —
   `.eq("tenant_id")` 4 sorguda da zaten var, `.eq(is_active, true)` da
   var (RLS'in sessizce uyguladığı koşul sorguda mevcut, Y1'deki gibi
   eksik filtre regresyonu beklenmiyor; yine de test edilmeli).
2. SONRA `homepage_sections_public_read` + `homepage_section_items_public_read`
   policy'lerini DROP eden migration (025'teki isimlerle). Sıra Y1 Parça
   B'deki gibi KRİTİK: önce kod deploy, sonra policy DROP — ters sıra
   public anasayfa bölümlerini boşaltır.

---

# 📋 BACKLOG — Süper admin panelini ayrı host'a taşı (Senaryo A)

**Ne zaman:** VPS deploy'unda değerlendirilecek. Acil değil (Y2 sanitize
hattı riski büyük ölçüde kapattı), ama mimari olarak istenmeyen durum
devam ediyor.

**Sorun:** `/super-admin` rotaları apex host'ta servis ediliyor. Apex'te
`parseHostname` → `{type:"apex"}` → tenant slug `"default"`. Yani
**`default` tenant'ın public sayfaları süper admin paneliyle aynı origin'i
paylaşıyor.** Süper admin varsayılan olarak apex'te login olduğu için
(`middleware.ts`: next yoksa `/super-admin`) çerezi de orada durur.
`default` tenant'ta admin yetkisi olan (ama süper admin olmayan) biri,
o origin'de çalışacak herhangi bir XSS ile süper admin oturumuna ulaşır.

**Öneri:** Süper admin panelini `admin.{apex}` gibi ayrı bir host'a taşımak.
Çerez host-only olduğu için bu, süper admin oturumunu hiçbir tenant'ın
public içeriğiyle aynı origin'de bulunmayacak şekilde izole eder.

**Dikkat:** Senaryo B (süper admin'in tenant subdomain'inde login olması)
bu taşımayla **kapanmaz** — `/super-admin/tenants` sayfasındaki "Admin
paneli" linki tasarım gereği tenant origin'ine login gerektiriyor. Onun
için ayrı bir değerlendirme gerekir (ör. impersonation'ı server tarafında
kısa ömürlü token'la çözmek).

---

# 📋 BACKLOG — next/image için ortak güvenli-src sarmalayıcı

**Nereden çıktı:** Y2 sanitize hattının `<img src="x">` bug fix'i
(28 Temmuz 2026). O düzeltme yalnızca detay sayfası zincirini
(`extractImagesFromHtml` → `DetailPageLayout.photos[]`) korudu.

**Sorun:** `NewsCard`, `GalleryGrid`, `BoardMemberCard` gibi **diğer
`next/image` çağrıları bozuk DB URL'ine karşı aynı derecede kırılgan**
(`cover_image`, `photo`, `logo` kolonları). next/image tanımadığı bir src
ile render sırasında hata fırlatır ve sayfayı 500'e düşürür; bu kolonlar
ne sanitize'dan ne de `isNextImageSafeUrl`'den geçiyor.

**Öneri:** `src/lib/utils.ts`'teki `isNextImageSafeUrl` zaten var. Ayrı iş
olarak, bu kontrolü içeride yapan ortak bir sarmalayıcı bileşen
(ör. `<SafeImage />` — geçersiz src'de `next/image` yerine placeholder ya
da `null` döner) değerlendirilmeli ve tüm `next/image` çağrı yerleri ona
geçirilmeli. İlke: **bozuk veri hiçbir zaman 500'e yol açmamalı.**

## ✅ KAPATILDI (28 Temmuz 2026)

Bu bir **DoS**'tu: kötü niyetli (ya da dikkatsiz) bir tenant admin kendi
`cover_image`/`photo`/`image_url`/`logo_url` kolonuna `"x"` yazarak kendi
tenant'ının anasayfasını, listelerini, galerisini çökertebiliyordu. En
kötüsü `logo_url`: Navbar `(public)/layout.tsx`'te olduğu için sitenin
**tamamı** 500'e düşüyordu.

Yapılanlar:

- **`src/components/SafeImage.tsx`** (yeni) — direktifsiz (universal)
  sarmalayıcı. `isNextImageSafeUrl(src)` false ise `next/image` **hiç
  çağrılmaz**, `fallback` render edilir. Proplar tek tek sayılmaz:
  `Omit<ImageProps,"src">` + `...rest` ile next/image'ın kendi tipi
  devralınır, böylece hiçbir prop sessizce düşemez.
- **`isNextImageSafeUrl` artık type predicate** (`url is string`) — çağıran
  tarafta tip daralır, non-null assertion gerekmez.
- **30 `<Image>` çağrısının tamamı** SafeImage'a geçirildi (19 public +
  9 admin + DetailPageLayout'un 2'si). Her çağrı yerinin kendi "görsel yok"
  JSX'i `fallback` prop'una **aynen** taşındı → bozuk src ile görsel-yok
  görünümü birebir aynı.
- **Dizi tüketicilerinde SafeImage değil, kaynakta filtre:** `GalleryGrid`
  artık `images`'ı başta `isNextImageSafeUrl` ile eliyor. Per-item `null`
  render etmek ızgarada boş kutu bırakır **ve lightbox index matematiğini
  kaydırırdı**. `ImageLightbox` içeride filtrelemez (dışarıdan gelen
  `initialIndex`'i kaydırırdı) — sözleşme prop yorumunda yazılı, tek
  çağıranı olan `DetailPageLayout` zaten filtreli veriyor.
- **`DetailPageLayout`'un `photos[]` filtresi KALDI** — o filtre yalnızca
  çökmeyi değil, `photoCount`/`hasMedia`/lightbox index'inin doğruluğunu da
  sağlıyor. SafeImage'a geçiş orada sadece lint kilidi için.
- **Lint kilidi:** `.eslintrc.json` → `no-restricted-imports` ile
  `next/image` proje genelinde yasak, tek istisna `SafeImage.tsx`
  (`react/no-danger` + `SafeHtml` deseninin eşi).

Doğrulama: `npm run test:sanitize` 68 fixture geçiyor; build ve lint temiz.
Ayrıca canlı A/B: bir haberin `cover_image`'i `'x'` yapıldığında ham
`next/image` ile `/` ve `/haberler` **500**, SafeImage ile **200** döndü.

---

# ⛔ 013_revert_tenant_aware_rls.sql — ÇALIŞTIRILMAMALI (arşiv)

Bu rollback dosyası **tehlikelidir**, üretimde asla çalıştırılmamalı:

- `tenants_auth_insert/update/delete` politikalarını
  `USING (true) TO authenticated` olarak geri kurar (013:81-86) →
  **her tenant admini her tenant'ı silebilir/değiştirebilir.**
- `tenant_users_auth_*` aynı şekilde açılır (013:88-95) → herkes istediği
  tenant'a kendini admin ekleyebilir.
- 15 içerik tablosunu tenant-agnostic hale döndürür → **tenant izolasyonu
  tamamen kalkar.**
- `user_has_tenant_access` fonksiyonunu DROP eder (013:98) → 017 storage
  politikaları ve 019/021 politikaları da kırılır.

012'de bir sorun çıkarsa rollback yerine hedefe yönelik düzeltme yazılmalı.
Dosya yalnızca tarihsel referans olarak duruyor.

---

# İletişim Formu Backend — Faz 1 (DB kaydı + admin okuma)

İletişim formu artık gerçek: form → `/api/contact` (POST) → server tenant'ı
**hostname'den** belirler → honeypot + rate limit + validation → service role
ile `contact_messages`'a kaydeder. Admin panelde **"Gelen Mesajlar"** sayfasından
okunur. (E-posta bildirimi **Faz 2** — domain gelince, ayrı.)

## 1. Migration 021 Uygulanması (elle)

`supabase/migrations/021_contact_messages.sql` Supabase SQL Editor'dan
çalıştırılmalı (011/012/.../020 gibi). İki tablo oluşturur:
- `contact_messages` (tenant-scoped, RLS: sadece tenant admin okur/siler;
  **anon INSERT policy YOK** — kayıt service role ile yapılır)
- `contact_rate_limit` (ip_hash — ham IP değil; RLS açık + policy'siz =
  yalnız service role)

İdempotent — ikinci kez çalıştırılırsa hata vermez.

## 2. CONTACT_IP_SALT env (opsiyonel ama önerilir)

Rate-limit IP hash'i için salt. `.env.local` ve Vercel'e eklenmeli:
```
CONTACT_IP_SALT=<rastgele-gizli-deger>
```
Eksik bırakılırsa sabit fallback kullanılır (çalışır ama production'da
benzersiz değer önerilir). Ham IP saklanmaz; IP + salt SHA-256'lanır.

## 3. Faz 1 Sonrası Notlar (Faz 2 / teknik borç)

- **E-posta bildirimi (Faz 2):** Yeni mesaj gelince tenant admin'ine mail.
  Domain + Resend SMTP gelince eklenecek. Altyapı hazır — DB satırı mevcut,
  bildirim `/api/contact`'ın sonuna eklenebilir.
- **contact_rate_limit temizliği:** Tablo zamanla büyür. >1 saatlik kayıtlar
  için periyodik temizlik (cron/scheduled) ileride eklenmeli.
- **Badge:** Sidebar okunmamış sayacı `contact-messages-updated` window
  event'i ile yenilenir (poll yok); sekme/sayfa değişiminde de fetch eder.

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
repo'da durur, otomatik uygulanmaz — ⛔ **çalıştırılmamalı**, gerekçesi
dosyanın başındaki "013 — ÇALIŞTIRILMAMALI" bölümünde.

### 010_super_admin.sql — Süper Admin İşaretleme (⛔ GEÇERSİZ — 022 ile değişti)

**Bu bölümdeki yöntem bir GÜVENLİK AÇIĞIYDI (K1) ve artık kullanılmıyor.**
`user_metadata` kullanıcının kendisi tarafından yazılabildiği için herkes
kendini süper admin yapabiliyordu. Yetki `public.super_admins` tablosuna
taşındı (migration 022).

Güncel yöntem için dosyanın başındaki **"🔴 GÜVENLİK — K1"** bölümüne bakın.
Aşağıdaki eski SQL yalnızca tarihsel referanstır, **ÇALIŞTIRMAYIN**:

```sql
-- ⛔ ESKI / GUVENSIZ — KULLANMAYIN
-- UPDATE auth.users
-- SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
--                           || '{"is_super_admin": true}'::jsonb
-- WHERE email = 'KULLANICI@ORNEK.COM';
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

> 🔴 **GÜNCEL DURUM — DOĞRULANMALI (Güvenlik denetimi Tur 1, bulgu K2):**
> 017'nin apply edildiğine dair repoda **hiçbir kayıt yok** ve Sprint 4 M5
> doğrulaması da yalnızca `user_has_tenant_access` fonksiyonunu teyit etti,
> 017'yi değil. Uygulanmadıysa storage'da hâlâ tenant-agnostic politikalar
> geçerlidir (`018:39-55`: `bucket_id = 'images'`, tenant filtresi yok) →
> **herhangi bir tenant admini, başka bir tenant'ın görsellerini silebilir
> veya üzerine yazabilir** (defacement). Deploy öncesi kontrol:
> ```sql
> SELECT policyname, cmd FROM pg_policies
> WHERE schemaname='storage' AND tablename='objects';
> ```
> `images_tenant_insert/update/delete` görünmüyorsa: **önce**
> `npm run migrate:storage` (Aşama 2 prefix göçü), **sonra** 017.
> Sıra kritik — tersi eski prefix'siz dosyalara erişimi kırar.

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

---

# Sprint 3 — Tamamlandı (24 Haziran 2026)

Sprint 3'ün 4 maddesi tamamlandı ve lokalde test edildi. **Sprint 3 yeni
migration GEREKTİRMEZ** — tümü kod değişikliği. (Sadece Sprint 2.4 / Aşama 3'ün
`017_storage_tenant_rls.sql`'i hâlâ elle uygulanmalı; Sprint 3.6 storage
silmesi tenant-scoped DELETE izni için ona dayanır — uygulanmasa bile eski
generic policy ile çalışır.)

## Madde 3.3 + 3.4 — extractSlug Refactor + Custom Domain

- Yeni helper: `src/lib/tenant-hostname.ts` (saf parse, Edge + Client + Node uyumlu)
- 3 kopya `extractSlugFromHostname`/`extractSlug` silindi (middleware.ts, tenant.ts, useTenant.tsx)
- Discriminated union: `HostnameMatch = apex | subdomain | custom_domain`
- Yeni env: `NEXT_PUBLIC_ROOT_DOMAIN` (apex/subdomain ayrımı; fallback `lvh.me`).
  `.env.local`'e elle eklenmeli; Vercel'de `sendika-site.vercel.app`.
- 3+ parçalı custom domain parse bug'ı düzeltildi (gizli bug, dolu custom_domain yoktu)
- **Aşama B:** Middleware'de `parseHostname` + custom_domain DB lookup eklendi
  (yalnız `type === "custom_domain"` iken; anon key, koşullu sorgu, cache yok)
- `supabaseResponse` final slug sonrası **yeniden kuruldu** — forward edilen request
  header'ı (`x-tenant-slug`) `setAll` tetiklenmese bile doğru slug'ı taşısın diye kritik
- Ölü kod `getTenantFromHostname` silindi
- Test: test-abc tenant + `lokaltest.com` hosts dosyası → custom domain server'da hatasız çözülüyor

## Madde 3.1 — Yetim auth.users Temizlemesi (3 Aşama)

- **Aşama A+B:** YENİ endpoint `POST /api/super-admin/delete-tenant`
  (server-side tenant silme + sole-tenant auth.users temizliği)
- **Aşama C:** YENİ helper `src/lib/super-admin/cleanup-orphan-user.ts`
  - Discriminated union `CleanupResult` (multi-tenant / super-admin / error)
  - Optional `excludeTenantId` (delete-tenant cascade-after = omit; tenant-users decide-first = ver)
  - 3-yönlü süper admin guard (`user_metadata`/`app_metadata` boolean + string `"true"`) — asla silinmez
- `delete-tenant` cascade-after (memberUserIds topla → tenant sil/cascade → helper)
- `tenant-users` DELETE decide-first (helper önce → korunduysa üyelik satırını elle sil)
- Frontend 207 Multi-Status dalı + `userDeleted`/`cleanupError` yanıt alanları
- DeleteModal description'ları "hesap tamamen silinir" uyarısıyla güncellendi
- **NOT:** `requireSuperAdmin` paylaşılan export DEĞİL — her route kendi lokal guard'ını
  tanımlıyor (`is_super_admin` RPC tabanlı), 3 route'ta birebir aynı
- Test: T1 sole-tenant silinir, T2 multi-tenant korunur (UI ile çift tenant yaratılabilir),
  T4 delete-tenant regression

## Madde 3.8 — Super Admin Toggle API Endpoint

- YENİ endpoint `POST /api/super-admin/toggle-tenant`
- `requireSuperAdmin` lokal RPC tabanlı guard (delete-tenant/tenant-users ile birebir tutarlı —
  prompttaki inline-metadata sürüm yerine RPC seçildi)
- Default tenant blanket guard server-side (`slug === "default"` → 403)
- `togglingId` state per-row loading (çift tıklama önleme); optimistic değil
- Migration 014 trigger son savunma hattı olarak korundu (service role ile bile bypass edilmez)
- RLS `tenants_super_admin_update` yerinde tutuldu (savunma derinliği)
- `handleToggle` + `handleDelete` artık fetch ile server'a gidiyor; `createClient`
  sadece `fetchTenants` için kaldı

## Madde 3.6 — Orphan Storage Temizlemesi

- YENİ helper'lar `src/lib/storage.ts`:
  - `storagePathFromUrl(publicUrl, bucket?)` — public URL → bucket-göreli path (query defansif)
  - `removeFilesFromStorage(supabase, bucket, paths)` — best-effort, idempotent,
    tek çağrıyla N dosya, `StorageRemovalResult` discriminated union
  - `purgeContentMedia(supabase, tenantId, contentType, contentId)` — polimorfik
    content_media satırlarını ELLE siler + storage path'lerini döndürür
- 9 entity-delete handler'ına storage temizliği:
  haberler, duyurular, sayfalar, slider, manşet, yönetim-kurulu, şubeler,
  galeri (albüm cascade-after), galeri/[id] (foto)
- 4 entity-delete (haber/duyuru/sayfa/manşet) ek olarak `purgeContentMedia` çağırıyor
- 3 edit-save akışına `removed` galeri storage temizliği:
  haberler/[id], duyurular/[id], sayfalar/[id]
- **content_media polimorfik (content_id'de FK YOK) → cascade gitmiyor** keşfedildi;
  hem DB satırı hem storage dosyası çift-orphan oluyordu → `purgeContentMedia` ile elle silme
- Sıra her yerde: path yakala → DB sil → storage temizle (storage hatası DB akışını bozmaz)

---

# Sprint 4 — Tamamlandı (24 Haziran 2026)

Sprint 4'te 4 madde tamamlandı ve lokalde test edildi (Madde 3, 2, 4 kod/migration;
Madde 5 ek migration). Migration'lar elle apply edildi (NOTE.md "elle apply" modeli).

## Madde 3 — content_media Migration'a Alınması (Drift Kapatma)
- YENI migration: `019_content_media.sql`
- Mevcut Dashboard-created tablo migration'a alındı (idempotent)
- CHECK constraint'ler eklendi (content_type + media_type) — `DO $$` + pg_constraint pattern
- YENI bileşik index: `idx_content_media_lookup (content_type, content_id)` — sorgu performansı
- KRİTİK: `content_media_public_read` policy İLK KEZ repo'ya alındı (anon SELECT buna bağımlıydı,
  012 bu policy'i hiç içermiyordu — yalnız Dashboard'da vardı)
- Eski Dashboard policy isimleri (`Public read media`, `Auth full access media`) DROP IF EXISTS ile temizlendi
- Yeni tutarlı isimler: `content_media_public_read` + `tenant_content_media_all`
- FK kararı: Polimorfik tasarım korundu (content_id, FK yok)
  - Gerekçe: Rails-tarzı polymorphic associations, mevcut `purgeContentMedia` ile uyumlu
  - CHECK constraint tipo koruması (`content_type IN ('news','announcement','page','headline')`)
- NOT NULL kasıtlı eklenmedi (009 zaten doldurup SET NOT NULL yaptı; fresh-reset güvenliği)
- Lokal apply: Süleyman elle SQL Editor'da uyguladı
- Test: 5 SQL doğrulama sorgusu geçti (data sayısı değişmedi, constraint+index+policy doğru)
- Idempotent: ikinci kez çalıştırılırsa hata vermez

## Madde 2 — Tenant Düzenleme Server Endpoint
- YENI endpoint: `/api/super-admin/update-tenant` (POST, flat body)
- Sprint 3.8 toggle pattern adapte edildi (lokal `requireSuperAdmin` + `is_super_admin` RPC)
- 8 güvenlik katmanı:
  1. requireSuperAdmin guard (mevcut pattern)
  2. Body type validation (tenantId, name, slug, isActive zorunlu + tip)
  3. Default tenant 2'li guard:
     - slug "default"tan değiştirilmeye çalışılırsa 403
       (KRİTİK: 014 trigger SADECE is_active'i koruyor, slug DB'de korumasız)
     - is_active=false denenirse 403 (trigger redundancy + Sprint 3.8 simetri)
  4. Slug format (SLUG_REGEX) + uzunluk (2-50) + rezerve liste
  5. Custom domain format (CUSTOM_DOMAIN_REGEX, opsiyonel)
  6. Slug uniqueness pre-check (değişirse, 409)
  7. Custom domain uniqueness pre-check (varsa, 409)
  8. 23505 fallback (race condition)
- `src/lib/constants.ts` genişletildi:
  - RESERVED_TENANT_SLUGS (8 değer: default, www, admin, api, app, auth, static, cdn)
  - SLUG_REGEX, SLUG_MIN_LENGTH (2), SLUG_MAX_LENGTH (50)
  - CUSTOM_DOMAIN_REGEX (hostname formatı, en az bir nokta)
- BONUS FIX: create-tenant API rezerve slug guard eklendi (client-only guard atlanabilirdi)
- BONUS FIX: yeni tenant sayfası hardcoded liste → RESERVED_TENANT_SLUGS (DRY)
- updated_at server-set (client saatine güvenme)
- Frontend handleSave fetch'e geçti, setOriginalSlug korundu (UI banner)
- NOT: Gerçek dosyalar `react-hot-toast` (`toast.error/success`) kullanıyor — prompt'taki
  `setToast` örneği uyarlandı; create-tenant'ta değişken `slug` (prompt `normalizedSlug` yazıyordu)
- Test: 7 senaryo geçti (normal, rezerve, default slug 403, default pasif 403,
  geçersiz custom domain, yeni tenant rezerve, slug çakışma)

## Madde 4 — ImageUploader Replace Orphan
- YENI helper: `cleanupReplacedFile(supabase, oldUrl, newUrl, bucket="images")`
  - Best-effort, idempotent (no-op kuralları: boş/eşit/parse edilemez URL)
  - `storagePathFromUrl` + `removeFilesFromStorage` üzerine wrapper
- 11 sayfa / 12 alan etkilendi
- İki pattern uygulandı:
  - **Pattern 1 (Liste-tabanlı, 6 sayfa):** Eski URL listeden okunur (`list.find`)
    - slider/page.tsx, manset/page.tsx (+ video_url)
    - yonetim-kurulu/page.tsx, subeler/page.tsx
    - galeri/page.tsx (albüm listesi), anasayfa-bolumleri/[id]/page.tsx
  - **Pattern 2 (Initial snapshot, 5 sayfa):** `initialXxx` state'leri eklendi
    - haberler/[id]/page.tsx (cover + video)
    - duyurular/[id]/page.tsx (cover + video)
    - sayfalar/[id]/page.tsx (cover + video)
    - galeri/[id]/page.tsx (albüm cover, snapshot yenileme)
    - ayarlar/page.tsx (logo + favicon, snapshot yenileme)
- Mimari karar: Temizlik ImageUploader İÇİNDE DEĞİL, save flow'da yapıldı
  - Sebep: İptal senaryosunda in-component silme DB referanslı dosyayı silerdi
- subeler: `payload.manager_photo` kullanıldı (form değil, mod değişimini de kapsıyor)
- manset video_url orphan dahil edildi (MediaUploader "images" bucket; youtube_url harici link, temizlenmez)
- Snapshot yenileme: galeri/[id] ve ayarlar sayfa açık kalan akışlar (ardışık kayıtlar için)
- haberler/duyurular/sayfalar: save sonrası `router.push` ile ayrılıyor → snapshot yenileme gereksiz
- Test: 3 senaryo geçti (Slider replace, Haber cover replace, Ayarlar 3x logo)
- Build: 0 error / 0 warning (EXIT=0)

## Madde 5 — user_has_tenant_access Super Admin Shortcut (Migration 020)
- YENI migration: `020_super_admin_tenant_access.sql`
- **KEŞIF (drift):** Repo'daki `user_has_tenant_access` (012:22-28 ve 017:42-48) ZATEN
  `OR public.is_super_admin(auth.uid())` içeriyordu → fonksiyon mantıken super admin'i kapsıyor.
  Prompt'un "fonksiyon yalnızca tenant_users'a bakıyor" teşhisi repo ile çelişiyordu.
- Migration 020 imza-uyumlu `CREATE OR REPLACE`:
  - Parametre adı `tenant_id_param` KORUNDU (prompt `check_tenant_id` öneriyordu →
    apply'da "cannot change name of input parameter" ile patlardı)
  - `SET search_path = public` KORUNDU (prompt taslağında yoktu → SECURITY DEFINER güvenlik regresyonu)
  - LANGUAGE sql / STABLE / SECURITY DEFINER 012/017 ile birebir; super admin kontrolü ÖNE alındı
- AMAÇ: DB'de drift etmiş (eski, super admin'siz) bir sürüm kalmışsa repo mantığına hizalar
- KRİTİK: Eğer DB'deki fonksiyon zaten 012 sürümüyse 020 davranışı DEĞİŞTİRMEZ
  - O durumda gerçek kök neden BAŞKA: en olası → `017_storage_tenant_rls.sql` HİÇ apply edilmemiş
    (NOTE.md Sprint 2.4 kaydı: "017 OLUŞTURULDU ama UYGULANMADI") → storage DELETE policy eksik
- Süleyman apply ÖNCESİ doğrulama: `SELECT pg_get_functiondef('public.user_has_tenant_access(uuid)'::regprocedure);`
  → çıktıda `is_super_admin` geçiyor mu? Geçmiyorsa drift vardı (020 asıl çözüm); geçiyorsa 017 öncelikli kontrol.
- NOT: `is_super_admin` (010) yalnızca `raw_user_meta_data` (user_metadata) okur; app_metadata'da
  işaretliyse FALSE döner → Süleyman hesabında `raw_user_meta_data->>'is_super_admin' = 'true'` doğrulanmalı.
- **APPLY DURUMU (Süleyman doğrulaması):** apply edilmedi. pg_get_functiondef çıktısı
  fonksiyonun zaten super admin shortcut'i içerdiğini gösterdi (drift YOK). 020 dosyası
  repo'da kaldı (gelecekte drift olursa hizalama için), davranış değişikliği yok.
  Slider replace testi de başarıyla çalıştı — gerçek root cause initial test
  senaryosunun yanlış yorumlanmasıymış (yeni oluşturma vs replace).

---

# Sprint 5+ Teknik Borç (Sprint 4 sonrası güncellenen)

## Yüksek Öncelikli

1. **Admin CRUD server endpoint migration** (Sprint 3.1/3.8/Sprint 4 M2 disiplini)
   - Şu an 9+ admin sayfası client-side `supabase.from(...).delete()/update()` kullanıyor
   - Sprint 3.1/3.8/Sprint 4 Madde 2 pattern'i bunlara uygulanmalı
   - Etkilenen: haberler, duyurular, sayfalar, slider, manşet, yönetim-kurulu,
     şubeler, galeri (albüm + foto), anasayfa-bolumleri
   - NOT: super-admin/tenants CRUD'ları artık server'da (create/delete/toggle/**update** —
     Sprint 4 M2'de tamamlandı). Kalan tüm admin CRUD'lar client-side.
   - Büyük iş, ayrı sprint (1-2 hafta)

## Orta Öncelikli

2. **HTML content embed img tag'ları** — RichTextEditor'da içeriğe gömülen img'ler.
   Entity silinince HTML parse + tüm `<img src>` toplama gerekir. `cleanupReplacedFile`
   helper'ı var ama HTML parse ayrı scope. Büyük parse karmaşıklığı, ayrı madde.

3. **content_media `media_type='video'` doğrulama** — Şema 'video'ya izin veriyor
   (CHECK constraint var, 019). Runtime'da video `news/announcements/pages/headlines.video_url`
   ayrı kolonda tutuluyor. content_media tablosunda video tipi gerçekten kullanılıyor mu
   belirsiz; doğrulanmalı, gerekiyorsa silme + replace akışları güncellenmeli.

4. **Fresh DB Reset desteği** — Migration 009 ve 012 content_media tablosunu
   target_tables'da arıyor ama tablo o sırada henüz yok (019'da yaratılır).
   Production ve lokal'de "elle apply" modeli olduğu için gizli kalmış. Eğer CI/CD'de
   `npx supabase db reset` kullanılmak istenirse 009/012/019 sıralaması (veya defansif
   tablo varlık kontrolü) gözden geçirilmeli.

## Bilgi / Mikro

5. **Email rate limit (production)** — Supabase default provider saatlik ~3-4 mail.
   Production'da Resend SMTP entegrasyonu planlanmalı (volume artarsa). Test sırasında gözlemlendi.

6. **Anon SELECT all tenants — güvenlik incelemesi** — `tenants_public_select`
   `USING (true)` ile anon tüm tenant satırlarını okuyabiliyor (subdomain/custom_domain
   lookup için gerekli). Hangi kolonların açık olduğu ve hassas alan sızıntısı riski
   gözden geçirilmeli.

## Production Deployment Sırası

7. **Wildcard subdomain / production domain yapılandırması**
   - Şu an Vercel preview URL'i kullanılıyor (sendika-site.vercel.app)
   - "Admin paneline gir" butonu `<tenant-slug>.vercel.app` pattern'ine yönlendiriyor
     ama bu subdomain'ler Vercel'de tanımlı değil (lokal'de lvh.me ile çalışıyor)
   - Production'a geçişten önce gerekli:
     - Gerçek custom domain (örn. sendika.app veya benzer)
     - DNS wildcard (`*.domain.com` → Vercel)
     - Vercel'de wildcard domain yapılandırması
     - Veya alternatif: path-based tenant URL (`/admin?tenant=slug`)
   - Kod tarafı hazır (middleware `tenant-hostname.ts` custom_domain ve subdomain çözüyor),
     sunucu/DNS ayarı bekleniyor

---

# Mimari Notlar (Sprint 3 sonrası)

## Server vs Client Pattern

- **Server endpoint:** Süper admin operasyonları (tenant create/delete/toggle, tenant-users CRUD)
- **Client direct:** İçerik CRUD (admin/haberler, admin/duyurular, vb.) — Sprint 4+ migrate edilecek
- Server endpoint guard'ı her zaman: lokal `requireSuperAdmin` + `is_super_admin` RPC

## Helper Klasör Yapısı

- `src/lib/super-admin/` — Süper admin domain helper'ları (`cleanup-orphan-user`)
- `src/lib/storage.ts` — Storage util'leri (`buildStoragePath`, `generateFileName`,
  `storagePathFromUrl`, `removeFilesFromStorage`, `purgeContentMedia`, `cleanupReplacedFile`)
- `src/lib/tenant-hostname.ts` — Hostname parse (Edge + Client + Node, saf fonksiyon)

## Cascade / Silme Pattern'leri

- **Cascade-after:** Gerçek FK cascade varsa → entity sil → cascade tamamlanır → helper
  çağır (delete-tenant, galeri albüm). Path/üye listesi cascade'den ÖNCE toplanır.
- **Decide-first:** `excludeTenantId` gerekli durumda → helper önce çağrılır, sonuca göre
  satır elle silinir (tenant-users DELETE)
- **Explicit-delete:** FK yoksa elle sil (`purgeContentMedia` — content_media polimorfik)

## Best-Effort Storage Cleanup

- Storage temizliği DB silmeden SONRA, best-effort
- Storage hatası DB akışını bozmaz (orphan = status quo, console'a loglanır)
- Discriminated union sonucu ile çağıranlar 207 raporu üretebilir

---

# Mimari Notlar (Sprint 4 sonrası yeni)

## Migration Drift Yönetimi
- Supabase'de elle Dashboard-created tablolar olabilir (content_media gibi)
- Sprint 4 Madde 3 ile drift kapatma pattern'i belgelendi:
  - `CREATE TABLE IF NOT EXISTS` (mevcut tabloyu bozmadan)
  - `ADD COLUMN IF NOT EXISTS` (eksik kolonlar için)
  - `DROP POLICY IF EXISTS` + `CREATE POLICY` (çakışmayı önleme)
  - `DO $$` + pg_constraint kontrolü (CHECK constraint IF NOT EXISTS Postgres'te yok)
- Tüm migration'lar IDEMPOTENT olmalı (production'da elle apply ediliyor)
- Drift sadece tablolarda değil FONKSIYONLARDA da olabilir: Sprint 4 M5'te DB'deki
  `user_has_tenant_access`'in repo sürümünden farklı olabileceği (super admin'siz eski
  sürüm) keşfedildi → apply öncesi `pg_get_functiondef` ile doğrulama disiplini

## Polimorfik Foreign Key (content_media)
- content_id polimorfik (content_type='news'/'announcement'/'page'/'headline')
- Tek bir FK hedefi tanımlanamadığı için gerçek FK YOK
- Cascade çalışmaz, `purgeContentMedia` helper elle siliyor
- CHECK constraint tipo koruması (Sprint 4 Madde 3, migration 019)

## Replace Orphan Pattern (Sprint 4 Madde 4)
- İki pattern: liste-tabanlı (form.id ile listede bul) ve snapshot (`initialXxx` state)
- Snapshot yenileme: sayfa açık kalan akışlarda zorunlu (galeri/[id], ayarlar)
  - Yenilemeden ardışık kayıtlarda orphan üretir
  - router.push ile ayrılan sayfalarda (haberler/duyurular/sayfalar) gereksiz
- `cleanupReplacedFile` component DIŞINDA (save flow'da) çağrılır
  - İptal senaryosunda DB referanslı dosya silinmesin diye (ImageUploader'a dokunulmadı)

## Senior Savunma / Kanıt-Temelli Debug
- Repo, prompt'taki varsayımlarla çapraz doğrulandı; bulgular olduğu gibi raporlandı
- Örnek (M5): `user_has_tenant_access`'in 012/017'de ZATEN super admin shortcut'lı olduğu
  keşfedildi → migration 020 "çözüm" olarak değil, drift düzeltme + niyet açıklığı için
  tutuldu; gerçek kök neden (017'nin apply edilmemiş olması) işaretlendi
- Örnek (M2): prompt taslağındaki `setToast` / `check_tenant_id` / eksik search_path
  gerçek koda ve apply güvenliğine göre düzeltildi
- İlke: bug iddiası ve "çözüldü" sonucu apply/test ile doğrulanmadan kesin sunulmaz

## b6 Aşama 2 Sonrası Backlog — JSON-LD (KAPSAM DIŞI bırakıldı)

NewsArticle + BreadcrumbList şemaları mevcut veriden otomatik üretilebilir
(~yarım gün iş: title/published_at/updated_at/cover_image + tenant adı/logosu;
breadcrumb props'ları sayfalarda zaten kurulu). Bilinçli olarak ertelendi:

- **Değer değerlendirmesi:** Sendika/dernek sitelerinde trafik ağırlıkla
  marka aramalı ve doğrudan geliyor; structured data'nın katkısı marjinal.
  Tek gerçek aday haber detayında NewsArticle (SERP'te tarih/rich result).
  Gerçek trafik verisi (Search Console) toplandıktan sonra karar verilecek.
- ⚠️ **CSP tuzağı:** CSP enforce modda (middleware.ts CSP_REPORT_ONLY=false)
  ve script-src nonce'lu. CSP, type="application/ld+json" dahil TÜM <script>
  elemanlarına uygulanır — JSON-LD script'i middleware'in set ettiği
  x-nonce header'ını (headers().get("x-nonce")) KULLANMALI, yoksa tarayıcı
  sessizce bloklar ve şema hiç görünmez. Middleware'deki "şu an kullanan yok"
  notu bu durumda güncellenmeli.

# 📋 NOT — Logo yükleyicisi bilinçli olarak sıkıştırmasız (b3)

`ayarlar/page.tsx`'teki logo ImageUploader'ı maxWidth/maxHeight
parametresi ALMIYOR — ImageUploader parametre verilmeyince sıkıştırmayı
tamamen atlar. Bu bilinçli: PNG keskinlik/şeffaflık kaygısı; favicon'da
`toWebp={false}` emsali var. Değiştirilecekse görsel kontrol şart.
(b3'te galeri kapak yükleyicilerine 1200×675 verildi, logo bilerek
dışarıda bırakıldı.)

# 📋 Terminoloji Sözleşmesi (b8)

Yeni UI metni yazarken bu kalıplara uy (merkezi sözlük dosyası BİLEREK yok
— kalıplar buradan, örnekler mevcut koddan alınır):

- Durum alanları: etiket her yerde **"Durum"**. Seçenekler alana göre:
  `is_published` → "Yayında / Taslak" (StatusBadge ile aynı);
  `is_active` → "Aktif / Pasif". "Yayın Durumu" etiketi KULLANILMAZ.
- Görsel terimleri: tekil kapak/dekor = **Görsel**; insan fotoğrafı ve
  galeri içeriği = **Fotoğraf**; görsel+video üst kategorisi = **Medya**.
  "Resim" kullanılmaz.
- Toast hata kalıbı: **"‹İş› başarısız oldu."** (Kaydetme/Silme/Güncelleme).
  "işlemi" dolgusu ve noktasız "başarısız." varyantı kullanılmaz.
- Sıralama toast'ları: "Sıralama kaydedildi." / "Sıralama kaydedilemedi."
- Sayfa başlığı = sidebar etiketi (birebir aynı). Panelde İngilizce kelime
  kullanılmaz (Dashboard → Özet).
- Saat yalnız aynı-gün sıralamanın önemli olduğu yerde gösterilir
  (gelen mesajlar, `formatDateTime`); içerik listelerinde `formatDate`.
