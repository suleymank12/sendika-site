# KURULUM — Sıfırdan Yeni Bir Supabase Projesi

Bu dosya, **boş bir Supabase projesinden çalışan bir siteye** kadar olan tüm
adımları sırayla anlatır. SQL tarafı iki dosyaya indirgenmiştir; geri kalanı
Dashboard'dan elle yapılır ve SQL ile otomatikleştirilemez.

**Sıra önemlidir.** Adımları atlamayın, atlarsanız hangi adımın eksik olduğunu
Adım 11'deki doğrulama listesi söyler.

| Adım | Ne | Nerede | Süre |
|---|---|---|---|
| 1 | Supabase projesi | Dashboard | 5 dk (provision) |
| 2 | Bağlantı bilgileri | Dashboard → Settings | 2 dk |
| 3 | Şema + tohum | psql / SQL Editor | 2 dk |
| 4 | `images` bucket | Dashboard → Storage | 2 dk |
| 5 | Süper admin | Auth + SQL | 5 dk |
| 6 | Auth URL ayarları | Dashboard → Auth | 3 dk |
| 7 | Custom SMTP (Resend) | Resend + Dashboard | 20 dk (DNS bekler) |
| 8 | Ortam değişkenleri + build | Sunucu | 10 dk |
| 9 | İlk kurum ve içerik | Panel | — |
| 10 | Yedekleme | VPS cron | 10 dk |
| 11 | Doğrulama | — | 5 dk |

---

## Adım 1 — Supabase projesi oluştur

Dashboard → **New project**.

- **Region:** `eu-west-1 (Ireland)`. Mevcut kurulum orada; VPS de Avrupa'da.
  Yanlış bölge sonradan **değiştirilemez**, proje taşınır.
- **Database password:** güçlü bir şifre üret ve **hemen bir parola yöneticisine
  kaydet**. Bu şifre `pg_dump`/`psql` ve gece yedekleri için gerekir; Dashboard
  bir daha göstermez (sıfırlanabilir ama yedek cron'u da güncellemek gerekir).
- **Plan:** Free ile başlanabilir, ancak Adım 4'teki **50 MB dosya sınırı** ve
  **7 gün inaktivite → proje duraklatma** kısıtları Free planda geçerlidir.
  Canlı müşteri sitesi Free planda tutulmamalı.

Proje hazır olana kadar (~2-5 dk) bekleyin.

---

## Adım 2 — Bağlantı bilgilerini topla

Dashboard → **Project Settings**:

| Bilgi | Nerede | Nereye gidecek |
|---|---|---|
| Project URL | Settings → API | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` / publishable key | Settings → API | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | Settings → API | `SUPABASE_SERVICE_ROLE_KEY` (**gizli**) |
| Project ref | URL'de `.../project/<ref>` | psql kullanıcı adında |
| Session pooler URI | Settings → Database → Connection string → **Session** | Adım 3, Adım 10 |

Bağlantı adresi şu biçimdedir:

```
postgresql://postgres.<ref>:<sifre>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require
```

> ⚠️ **Port 5432 (session mode) kullanın.** 6543 transaction mode'dur; `psql -f`
> ve `pg_dump` orada prepared statement hatası verir.

> ⚠️ `service_role` anahtarı RLS'i **tamamen** bypass eder. Asla client tarafına,
> git'e veya `NEXT_PUBLIC_*` bir değişkene konmaz.

---

## Adım 3 — Şema ve tohum

İki dosya, **bu sırayla**:

1. `supabase/migrations/000_baseline.sql` — tüm şema (tablolar, indexler,
   constraint'ler, RLS politikaları, fonksiyonlar, trigger'lar, GRANT/REVOKE'lar
   ve `storage.objects` politikaları). **Veri içermez.**
2. `supabase/migrations/001_seed_default.sql` — sitenin ilk açılışta patlamaması
   için gereken minimum veri (default tenant + 10 ayar + 5 menü öğesi).

### Yol A — psql (önerilen)

```bash
export PGURI='postgresql://postgres.<ref>:<sifre>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'

psql "$PGURI" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/000_baseline.sql
psql "$PGURI" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/001_seed_default.sql
```

`--single-transaction` + `ON_ERROR_STOP=1`: hata olursa **hiçbir şey kalmaz**,
yarım kurulmuş bir şemayı elle temizlemek zorunda kalmazsınız.

### Yol B — Supabase SQL Editor

Dosyaların içeriğini kopyalayıp SQL Editor'a yapıştırın, sırayla çalıştırın.
Baseline büyük bir dosyadır; editör takılırsa Yol A'yı kullanın.

### Hata çıkarsa

Güncel `scripts/dump-baseline.sh` ile üretilmiş baseline'ın boş bir Supabase
projesinde **hatasız** yüklenmesi beklenir. İlk tatbikatta (10 Eylül 2026,
PostgreSQL 17.6) çıkan 15 hata tablonun ilk iki satırıdır (3 + 12); ikisi de
script'te düzeltildi — **artık çıkmamalı**.

| Hata | Sebep | Çözüm |
|---|---|---|
| `function user_has_tenant_access(uuid) does not exist` | Baseline eski script'le üretilmiş: Bölüm C'deki storage policy'lerinde şema öneki yok. **`images_tenant_*` policy'leri oluşmaz → storage'da tenant izolasyonu olmaz** | Baseline'ı güncel script'le yeniden üretin (dosya elle düzenlenmez) |
| `permission denied to change default privileges` | Baseline eski script'le üretilmiş: `ALTER DEFAULT PRIVILEGES` satırları var (`supabase_admin` rolü için). SQL Editor ilk hatada **tüm çalıştırmayı durdurur** | Baseline'ı güncel script'le yeniden üretin |
| `syntax error at or near "\"` | Baseline `\restrict` satırı içeriyor (pg_dump 17.5+) | Baseline hatalı üretilmiş; `scripts/dump-baseline.sh` ile yeniden üretin |
| `must be owner of schema public` | Şema yorumu/ACL satırı | O satır silinebilir, kayıp yok |
| `must be owner of table objects` | `storage.objects` policy'leri | Bölüm C'yi atlayın, policy'leri Adım 4'te Dashboard'dan kurun |
| `role "anon" does not exist` | Supabase projesi değil, düz Postgres | Yanlış veritabanı |

> **Not:** `001_seed_default.sql` yalnızca yeni kurulumda çalıştırılır. Canlı
> veritabanında zaten mevcuttur; yine de çalıştırılırsa idempotenttir, hiçbir
> mevcut değeri ezmez.

---

## Adım 4 — `images` bucket'ı

Uygulama **tek bir bucket** kullanır ve adı koddan sabittir: **`images`**
(`lib/storage.ts`). Başka bir isim verilirse tüm görsel yüklemeleri kırılır.

Dashboard → **Storage** → **New bucket**:

| Alan | Değer | Neden |
|---|---|---|
| Name | `images` | Kodda sabit |
| Public bucket | ✅ **açık** | Site görselleri anonim okunuyor (`images_public_read`) |
| File size limit | **400 MB** | `MAX_UPLOAD_MB.VIDEO = 400` (`lib/constants.ts`). Görsel sınırı 50 MB, ikisi de aynı bucket'ta |
| Allowed MIME types | **boş bırakın** | Görsel + video birlikte; kısıtlama uygulamada yapılıyor |

> ⚠️ **Free planda dosya başına 50 MB üst sınırı vardır** ve bucket ayarı bunu
> aşamaz. Video yüklemesi gerekiyorsa ücretli plan şart.

> ⚠️ **Public bucket = URL bilen herkes okur.** Taslak içeriğin görselleri de
> okunabilir; bu bilinen ve kabul edilmiş bir durumdur (NOTE.md, Y1/Parça A).

**Klasör yapısı:** dosyalar `{tenant_id}/{tur}/{dosya}` biçiminde yazılır.
Bu prefix'i `storage.objects` politikaları zorunlu kılar — bir tenant başka bir
tenant'ın klasörüne yazamaz. Elle dosya yüklemeyin; panelden yükleyin.

**Policy'ler nerede:** baseline'ın **BÖLÜM C**'sinde. Adım 3'te yetki hatası
aldıysanız Dashboard → Storage → Policies'ten dört politikayı elle kurun; DDL
metinleri baseline dosyasının sonundadır (`images_public_read`,
`images_tenant_insert`, `images_tenant_update`, `images_tenant_delete`).

Doğrulama:

```sql
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
-- 4 satır beklenir
```

---

## Adım 5 — Süper admin

Süper admin yetkisi **yalnızca** `public.super_admins` tablosundan okunur
(`is_super_admin`, migration 022). Bu tabloda RLS açıktır ve **hiçbir policy
yoktur** — yani kullanıcı kendini süper admin yapamaz.

> ⛔ **Eskiden `auth.users.raw_user_meta_data` kullanılıyordu. ASLA geri
> dönmeyin.** O alanı kullanıcının kendisi yazabilir; tek istekle süper admin
> olunabiliyordu (K1 güvenlik açığı).

### 5.1 — Kullanıcıyı oluştur

Dashboard → **Authentication → Users → Add user**:

- **Invite user** (mail gider — Adım 7'deki SMTP hazır olmalı), **veya**
- **Create new user** + şifre belirle + "Auto confirm user" işaretle
  (SMTP henüz yoksa bu yolu kullanın).

### 5.2 — Yetkiyi ver

SQL Editor'da — **e-postayı elle yazmayın**, sorgu okusun:

```sql
INSERT INTO public.super_admins (user_id, note)
SELECT id, 'kurulum: ' || email
FROM auth.users
WHERE email = 'sizin@adresiniz.com'   -- SADECE BURAYI DEĞİŞTİRİN
ON CONFLICT (user_id) DO NOTHING;
```

Doğrulama (1 satır dönmeli):

```sql
SELECT u.email, sa.created_at
FROM public.super_admins sa
JOIN auth.users u ON u.id = sa.user_id;
```

Fonksiyon testi (`true` dönmeli):

```sql
SELECT public.is_super_admin(
  (SELECT id FROM auth.users WHERE email = 'sizin@adresiniz.com')
);
```

`false` dönüyorsa: `super_admins` üzerinde **FORCE ROW LEVEL SECURITY**
açılmış olabilir — açılmamalıdır, açılırsa `is_super_admin` tabloyu okuyamaz ve
süper admin paneli tamamen kilitlenir.

---

## Adım 6 — Auth URL ayarları

Dashboard → **Authentication → URL Configuration**:

| Alan | Değer |
|---|---|
| Site URL | `https://<apex-domain>` |
| Redirect URLs | `https://<apex-domain>/admin/davet-kabul*` |
| Redirect URLs | `https://*.<apex-domain>/admin/davet-kabul*` |

**Satır sonlarındaki `*` bilerek var.** Davet linkleri kurumu taşır
(`/admin/davet-kabul?tenant=<uuid>`). Supabase bir dönüş adresini iki yoldan
kabul eder:

- Adres **Site URL ile aynı host**'taysa desene hiç bakmaz — path ve query serbest.
- **Farklı host**'taysa (subdomain, custom domain, lokal `lvh.me`) adres bu
  listedeki bir desenle **baştan sona** eşleşmek zorundadır. Sonda `*` yoksa
  `?tenant=...` kısmı eşleşmez ve Supabase linki **hata vermeden** Site URL
  köküne düşürür — davet "açılmıyor" gibi görünür.

Desendeki `*`, `.` ve `/` karakterlerini geçemez: subdomain adına ve
`?tenant=<uuid>`'e yeter, başka bir siteye yönlendirmeye izin vermez.

Bugünkü akışta davetler `NEXT_PUBLIC_SITE_URL`'e (Adım 8) döner. Bu değer Site
URL ile birebir aynıysa (şema + host) apex satırındaki `*` hiç devreye girmez;
farklı yazılırsa (ör. `www.` ile) davetleri o `*` kurtarır — koymak bedava,
koymamak o hatayı sessiz yapar. Şifre sıfırlama linkleri kurumun kendi
adresine döner ve query taşımaz.

**Wildcard satırı zorunludur.** Her kurum bir subdomain'de çalışır; wildcard
yoksa subdomain'e düşen şifre sıfırlama linkleri Supabase tarafından
reddedilir.

Custom domain kullanan müşteriler için o domain de eklenmelidir:
`https://musteridomain.com/admin/davet-kabul*` (eklenmezse o kurumda şifre
sıfırlama çalışmaz).

**Lokal geliştirme** aynı Supabase projesine bağlıysa şu satırlar da gerekir.
Lokal davetler kurumun subdomain'ine döner (`http://{slug}.lvh.me:3000/...`) —
Site URL'den farklı host, yani desenle eşleşmek zorundadır; **sonda `*`
olmadan lokal davetler kırılır**:

| Redirect URLs (lokal) |
|---|
| `http://*.lvh.me:3000/admin/davet-kabul*` |
| `http://lvh.me:3000/admin/davet-kabul*` |

Ayrıca **Authentication → Providers → Email**:

- **Confirm email:** açık kalsın (davet akışı buna dayanıyor).
- **Allow new users to sign up:** **kapatın**. Uygulamada kayıt ekranı yok;
  tüm adminler süper admin panelinden davet ediliyor. Açık kalırsa herkes
  `auth.users`'a kayıt açabilir (yetkisi olmaz ama gereksiz hesap birikir).

---

## Adım 7 — Custom SMTP (Resend)

**Neden zorunlu:** Supabase'in yerleşik mail servisi saatte yalnızca birkaç mail
gönderir ve test sırasında rate limit'e takılır. Admin daveti ve şifre sıfırlama
bu mailler üzerinden yürüdüğü için custom SMTP olmadan panel pratikte
kullanılamaz.

### 7.1 — Resend tarafı

1. [resend.com](https://resend.com) → **Domains** → **Add Domain** → site alan adı.
2. Resend'in verdiği **SPF, DKIM ve DMARC** kayıtlarını DNS'e ekleyin.
3. Doğrulama yeşile dönene kadar bekleyin (DNS yayılımı 5 dk – birkaç saat).
4. **API Keys** → yeni anahtar üretin (bir kez gösterilir, kaydedin).

### 7.2 — Supabase tarafı

Dashboard → **Project Settings → Authentication → SMTP Settings** → **Enable
Custom SMTP**:

| Alan | Değer |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) veya `587` (STARTTLS) |
| Username | `resend` |
| Password | Resend API anahtarı |
| Sender email | `noreply@<alan-adiniz>` (doğrulanmış domain'de olmalı) |
| Sender name | Kurum adı |

> Değerleri Resend panelindeki **SMTP** sekmesinden teyit edin; Resend zaman
> zaman port/kullanıcı bilgisini günceller.

### 7.3 — Test ve bilinen sorun

Adım 5'teki hesabı silip **Invite user** ile yeniden davet edin; mail gelmeli.

> 📮 **Bilinen:** davet mailleri sıklıkla **spam** klasörüne düşüyor (şifre
> sıfırlama düşmüyor). SPF/DKIM/DMARC kayıtları ve Resend domain doğrulaması
> tamam olsa bile görülebiliyor. Müşteriye "spam klasörüne bakın" denmeli.

**Davranış tablosu** (9 Eylül 2026'da canlıda ölçüldü, tahmin değil):

| Kullanıcının durumu | Davet maili |
|---|---|
| Auth'ta kayıt yok | **gider** |
| Kayıtlı, daveti hiç kabul etmemiş | **gider** (yeniden davet) |
| Kayıtlı, şifresini belirlemiş / giriş yapmış | **gitmez** (`422 email_exists`) — panel bunu açıkça söyler |

---

## Adım 8 — Ortam değişkenleri ve build

`.env.local.example` dosyasını kopyalayıp doldurun:

| Değişken | Değer | Not |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Adım 2 | Build anında gömülür |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Adım 2 | Build anında gömülür |
| `SUPABASE_SERVICE_ROLE_KEY` | Adım 2 | **Gizli**, yalnızca sunucu |
| `NEXT_PUBLIC_ROOT_DOMAIN` | apex domain (portsuz) | Subdomain/custom domain ayrımı |
| `NEXT_PUBLIC_SITE_URL` | `https://<apex-domain>` | Davet linki tabanı, sonda slash yok |
| `CONTACT_IP_SALT` | rastgele gizli değer | İletişim formu rate-limit IP hash'i |

> ⚠️ **`NEXT_PUBLIC_*` değişkenleri BUILD ANINDA gömülür.** Sunucudaki `.env`
> dosyasını değiştirmek yetmez — **yeniden build almak** gerekir. Deploy akışı
> ve doğrulaması için NOTE.md → "VPS DEPLOY" bölümü.

Lokal geliştirmede `NEXT_PUBLIC_ROOT_DOMAIN=lvh.me` kullanılır; kurumlara
`http://{slug}.lvh.me:3000` üzerinden erişilir (`lvh.me` daima 127.0.0.1'e çözer).

---

## Adım 9 — İlk kurum ve içerik

1. `https://<apex-domain>/admin/giris` → Adım 5'teki hesapla giriş yapın.
2. Süper admin paneli: `/super-admin` → **Yeni Kuruluş**.
   - Kurum adı, subdomain (slug) ve admin e-postası girilir.
   - Panel otomatik olarak: tenant satırı + 10 varsayılan ayar + 5 menü öğesi
     oluşturur ve admini davet eder.
   - `default`, `www`, `admin`, `api`, `app`, `auth`, `static`, `cdn` slug'ları
     rezervedir, kullanılamaz.
3. **DNS:** yeni subdomain için wildcard A kaydı (`*.<apex-domain>`) olmalı.
   Custom domain bağlanacaksa müşterinin domain'i sunucuya yönlendirilmeli,
   Nginx'e `www` → apex 301 kuralı eklenmeli (NOTE.md'de örnek var).
4. Kurumun admin panelinden yapılacaklar (kurum admini yapar):
   - **Ayarlar:** logo, favicon, renk, iletişim bilgileri, sosyal medya
   - **Kategoriler:** haber kategorileri (tohum kategori oluşturmaz — bilinçli)
   - **Menü:** varsayılan 5 öğe düzenlenir/genişletilir
   - **Anasayfa Bölümleri:** anasayfa tamamen veri güdümlüdür, bölüm eklenene
     kadar boş görünür — bu normaldir

---

## Adım 10 — Yedekleme

Yeni proje **yedeksiz başlar**. İki yedek ayrı ayrı kurulmalıdır:

**Veritabanı** — VPS'te `/usr/local/bin/supabase-yedek.sh`, cron **04:00**,
gzip, 14 gün saklama. Yeni projede script'in içindeki bağlantı adresi (Adım 2)
güncellenmeli.

**Storage** — `scripts/backup-storage.mjs`, cron **04:30** (DB yedeğiyle
çakışmasın), artımlı, silinenler `_silinenler/{tarih}/` altında 30 gün arşivli.
`npm run backup:storage`. Ayrıntı: NOTE.md → "STORAGE YEDEĞİ".

> Bucket'ta **versiyonlama yoktur**: silinen görsel yedek yoksa geri gelmez.

---

## Adım 11 — Kurulum doğrulama

Sırayla çalıştırın; beklenen sonuçlar yanında.

```sql
-- 1) Tablolar geldi mi?  -> 20+ satır, aralarında tenants, super_admins,
--    homepage_sections, content_media, contact_messages olmalı
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- 2) RLS her tabloda açık mı?  -> 0 satır dönmeli
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;

-- 3) Süper admin fonksiyonu DOĞRU sürüm mü?  -> gövdesinde super_admins geçmeli,
--    raw_user_meta_data GEÇMEMELİ
SELECT prosrc FROM pg_proc WHERE proname = 'is_super_admin';

-- 4) anon, is_super_admin'i çağıramamalı  -> false
SELECT has_function_privilege('anon', 'public.is_super_admin(uuid)', 'EXECUTE');

-- 5) Default tenant  -> 1 satır, is_active = true
SELECT slug, name, is_active FROM public.tenants WHERE slug = 'default';

-- 6) Tohum  -> 10 ve 5
SELECT
  (SELECT count(*) FROM public.site_settings
     WHERE tenant_id = '00000000-0000-0000-0000-000000000001') AS ayar,
  (SELECT count(*) FROM public.menu_items
     WHERE tenant_id = '00000000-0000-0000-0000-000000000001') AS menu;

-- 7) Demo içerik SIZMAMIŞ olmalı  -> 0, 0
SELECT (SELECT count(*) FROM public.news) AS haber,
       (SELECT count(*) FROM public.announcements) AS duyuru;

-- 8) Storage policy'leri  -> 4 satır
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname;

-- 9) Eksik olduğu tespit edilen 7 kolon yerinde mi?  -> 7 satır
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (
    ('news','video_url'), ('news','youtube_url'),
    ('announcements','video_url'), ('announcements','youtube_url'),
    ('headlines','content'), ('headlines','video_url'), ('headlines','youtube_url')
  )
ORDER BY table_name, column_name;

-- 10) Süper admin  -> 1 satır
SELECT u.email FROM public.super_admins sa JOIN auth.users u ON u.id = sa.user_id;
```

**Uygulama tarafı:**

- [ ] Anasayfa açılıyor (boş ama hatasız — bölüm eklenmemiş olması normal)
- [ ] `/admin/giris` → süper admin girişi çalışıyor
- [ ] `/super-admin` açılıyor, kuruluş listesi görünüyor
- [ ] Yeni kuruluş oluşturuluyor, davet maili **geliyor** (spam'e bakın)
- [ ] Kurum admini davet linkiyle şifre belirleyip giriş yapabiliyor
- [ ] Admin panelden görsel yükleniyor (bucket + policy testi)
- [ ] Yüklenen görsel public sitede görünüyor
- [ ] İletişim formu mesaj kaydediyor

---

## Sonrası — şema değişirse

`000_baseline.sql` **elle düzenlenmez**. Şema değişikliği gerektiğinde `027`'den
devam eden numarayla yeni bir migration dosyası yazılır, canlıya elle uygulanır
ve repo'da durur. Baseline ancak yeterince dosya biriktiğinde
`scripts/dump-baseline.sh` ile **yeniden üretilir**.

Gerekçe ve tam strateji: **NOTE.md → "MIGRATION BASELINE"** bölümü.
