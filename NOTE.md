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

## Y1'in KALAN parçası (Parça B — henüz YAPILMADI)

`board_members` ve `branches` hâlâ anon'a açık: **kişisel e-posta ve
telefonlar** (yönetim kurulu üyeleri + şube yöneticileri) tüm kuruluşlar
için tek istekte toplanabiliyor — Y1'in asıl KVKK riski budur.

Bu tablolarda kolon kısıtlaması **mümkün değil** (e-posta/telefon public
detay sayfalarında gerçekten gösteriliyor; ayrıca sorgular `select("*")`
kullanıyor). Çözüm: public sayfaları server-side service-role + manuel
`.eq("tenant_id")` desenine (sitemap.ts deseni) taşımak, sonra public
policy'leri DROP etmek.

⚠️ **Parça B'de dikkat — iki sessiz regresyon riski:** RLS şu an
`is_active = true` koşulunu sessizce uyguluyor. Service-role'e geçince bu
kaybolur ve şu iki sorguda uygulama katmanında filtre YOK:
- `src/app/(public)/subeler/[slug]/page.tsx:66-72` → pasif yönetim kurulu
  üyesi şube yöneticisi olarak görünür hale gelir
- `src/app/(public)/subeler/[slug]/yonetici/page.tsx:50-59` → gereksiz
  redirect tetiklenir, çalışan sayfa 404 olur

Parça B'de bu iki sorguya `.eq("is_active", true)` eklenmeli.

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
