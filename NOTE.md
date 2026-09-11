# Elle Yapılacak İşler

Bu dosya, kod tarafında otomatize edilemeyen ama Supabase Dashboard veya
başka panellerden elle yapılması gereken adımları toplar.

---

# 💾 YEDEKTEN GERİ YÜKLEME — yeni DB yedeği + geri yükleme araçları (11 Eylül 2026)

**Durum:** ✅ **TATBİKAT TAMAMLANDI — geri yükleme uçtan uca kanıtlandı**
(11 Eylül 2026, boş test projesi `sendika-tatbikat2`; sonuçlar adım adım:
aşağıda "✅ Tatbikat sonucu"). **RTO ~1 saat, RPO ≤ 24 saat.** Canlı cron
yeni script'te — ilk koşumu (11 Eylül 04:00) tatbikatta kullanılan yedek.
Kalan elle iş: cron geçişinin 7. adımı (birkaç gece OK geldikten sonra eski
script + `.bak` silinir).

## Ölçüm — eski DB yedeği (11 Eylül, VPS)

Eski komut (`/usr/local/bin/supabase-yedek.sh` — repoda yoktu):
```
PGPASSWORD=*** pg_dump -h aws-0-eu-west-1.pooler.supabase.com -p 5432 \
  -U postgres.jqwmnawzehyvpwrtdvku -d postgres --no-owner --no-acl -f "$DOSYA"
```

| # | Bulgu | Anlamı |
|---|---|---|
| 1 | Şema seçimi yok — **tam döküm** | auth.users, auth.identities, storage.buckets, storage.objects COPY ile içinde → kullanıcılar ve şifre hash'leri yedekte ✅ ("`-n public` → kullanıcılar yok" riski YOK) |
| 2 | `--no-acl` → GRANT/REVOKE = **0** | 022'nin `REVOKE EXECUTE ON is_super_admin FROM anon` satırı yok → şema bu yedekten kurulursa **K1 açığı geri gelir** |
| 3 | CREATE SCHEMA: auth, extensions, graphql, graphql_public, pgbouncer, realtime, storage, vault | Yeni projede hepsi zaten var → çakışma; plain format → seçici yükleme yok |
| 4 | Dosya `\unrestrict …` ile bitiyor | psql meta-komutu (pg_dump 17.6+) — SQL Editor'da syntax error, yalnız psql 17.6+ okur |
| 5 | Script repoda yok, **şifre içinde düz metin** | VPS kaybında yeniden yazılmalı |

**Sonuç:** veri tam, ama bu yedek şema kaynağı olarak güvensiz ve ancak el
yordamıyla (COPY blokları ayıklanarak) kullanılabilirdi.

## Yeni DB yedeği — `scripts/backup-db.sh`

```
pg_dump --format=custom --schema=public --schema=auth --schema=storage \
  --no-owner --no-publications --no-subscriptions --no-security-labels \
  --file=/var/backups/supabase/yedek-YYYY-AA-GG_SSDDss.dump
```

- **Custom format:** `pg_restore -l` ile içerik listesi; `-n` / `-t` /
  `--data-only` / `--section` ile seçici geri yükleme (tek tablo, tek şema).
  Tablo verisi **gzip ile sıkıştırılır — ayrı gzip yok**. Ölçüldü: arşiv
  başlığında `Compression: gzip` (yerel PostgreSQL 17.11 ile alınan döküm).
- **Açık şema listesi:** public + auth (kullanıcılar, hash'ler) + storage
  (bucket/nesne bilgisi + storage.objects policy'leri). realtime, vault,
  graphql… projeye özgü, taşınmaz → alınmaz.
- **ACL dahil** (`--no-acl` yok) → K1 REVOKE'u yedekte. `--no-owner` custom
  formatta pg_dump tarafından yok sayılır (sahiplik arşive hep yazılır) —
  geri yüklemede `pg_restore --no-owner` verilir.
- **Şifre: `/root/.pgpass`** (izin 600) — env dosyası DEĞİL. Gerekçe:
  - PostgreSQL belgesi `PGPASSWORD`'u önermiyor (bazı sistemlerde süreç
    ortamı görülebilir); `.pgpass` ile şifre ne script'te ne ortamda.
  - libpq izni kendisi denetler (gevşek izinli `.pgpass`'ı YOK SAYAR); script
    bunu baştan kontrol edip açık mesajla durur.
  - `pg_dump` / `pg_restore` / `psql` aynı dosyayı kendiliğinden okur —
    tatbikat komutları da (test projesi için ikinci satır).
  - Env dosyasını `source` etmek kod çalıştırmaktır; `.pgpass` yalnız veri.
  - Script `PGPASSWORD`'u bilerek unset eder (kabukta kalmış şifre sızmasın).
- **Kendi doğrulaması** — biri düşerse log `durum=HATA`, çıkış 1, dosya
  **SİLİNMEZ** (o gecenin tek yedeği olabilir):
  1. şifre dosyası var + izin 600/400; araçlar kurulu; kilit (elle + cron aynı anda koşmaz)
  2. `pg_dump` çıkış 0 (önce `.part`'a yazılır, bitince rename — yarım dosya kalmaz)
  3. `pg_restore -l`: Format CUSTOM; `auth.users`, `auth.identities`,
     `storage.buckets`, `storage.objects` verisi var; **public TABLE DATA
     sayısı = canlıdaki public tablo sayısı** (`pg_tables`'tan o an okunur —
     tablo eklenince kendiliğinden uyar); `is_super_admin` ACL girdisi var
     (ACL'lerin gerçekten alındığının kanıtı)
- **Saklama:** 14 günden eski `yedek-*.dump` **ve eski biçim
  `yedek-*.sql.gz`** (+ yarım `.part`) silinir — **yalnız o gecenin yedeği
  doğrulamayı geçtiyse**. Yedekler üst üste bozulursa eski sağlamlar silinmez.
- **İzin:** `umask 077` → yedek ve log 600 (şifre hash'leri + kişisel veri).
- **Log** (`/var/backups/supabase/yedek.log`, storage yedeğiyle aynı desen):
  `2026-09-12T04:00:14 durum=OK dosya=yedek-2026-09-12_040001.dump boyut=1.4M sure=11s public=20/20 kullanici=14 sikistirma=gzip silinen=1`
- **Bağlantı:** varsayılan canlı proje (session pooler 5432, `PGSSLMODE=require`);
  `PGHOST` / `PGUSER` / … ortamdan değiştirilebilir.

**Doğrulandı:**
- **Gerçek PostgreSQL 17.11'e karşı uçtan uca** (WSL'de kullanıcı alanına
  kurulan yerel küme, `.pgpass` ile, PGPASSWORD yok): OK koşumu; saklama (20
  günlük `.sql.gz` + `.dump` silindi, 3 günlük ve ilgisiz dosya kaldı); dosya
  600; `pg_restore --data-only --schema=auth --table=users` ile seçici okuma;
  644 izinli şifre dosyası ve yanlış şifre → açık HATA satırı.
- Stub testi `npm run test:backup-db` **58/58** (Linux ister: WSL/VPS; Git
  Bash'te chmod etkisiz olduğu için test reddeder. PowerShell/cmd'den `npm`
  WSL'in bash'ini kullanır).
- Mutasyon: `--no-acl` eklemek, ACL kontrolünü kaldırmak, saklamayı
  doğrulamadan önceye almak, `.part` silmeyi kaldırmak, `umask`'ı kaldırmak,
  `unset PGPASSWORD`'u kaldırmak, auth.users kontrolünü kaldırmak → hepsinde
  test **FAIL**.

**Gerçek TOC biçimi** (doğrulamanın dayandığı — pg_restore 17.11):
```
;     Compression: gzip
;     Format: CUSTOM
3508; 0 16397 TABLE DATA auth identities <sahip>
3507; 0 16390 TABLE DATA auth users <sahip>
3523; 0 0 ACL public FUNCTION is_super_admin(user_id uuid) <sahip>
```
Boş tablolar da `TABLE DATA` girdisi alır (sayım doğru). ⚠️ TABLE DATA
girdileri **ada göre sıralı** — `auth identities`, `auth users`'tan ÖNCE
(public'te announcements, tenants'tan önce). Yalnız veri yüklenirken FK
sırası kendiliğinden sağlanmaz — ölçüldü: replica olmadan identities COPY'si
FK hatasıyla düştü, `SET session_replication_role = replica` ile geçti
(yerel PostgreSQL 17.11).

## ⏰ ELLE — canlı cron'u yeni script'e geçirme (VPS, root)

Eski script'e dokunulmaz, yenisi elle denenir, sonra cron değişir. Geri
dönüş: cron satırını eskiye çevirmek (eski script 7. adıma kadar yerinde).

```bash
# 0) Kaynak dizininde yeni script (deploy /opt/build'i güncellemez)
cd /opt/build/sendika-site && git pull          # ya da scripts/backup-db.sh'i elle kopyalayın
ls -l scripts/backup-db.sh

# 1) Şifre dosyası — şifre ESKİ script'teki PGPASSWORD değeri. Komut
#    satırına yazmayın (history'ye düşer); editörle:
umask 077 && nano /root/.pgpass
#    tek satır:
#    aws-0-eu-west-1.pooler.supabase.com:5432:postgres:postgres.jqwmnawzehyvpwrtdvku:<ŞİFRE>
#    (şifrede ':' ya da '\' varsa önüne '\')
chmod 600 /root/.pgpass
PGSSLMODE=require psql -h aws-0-eu-west-1.pooler.supabase.com -p 5432 \
  -U postgres.jqwmnawzehyvpwrtdvku -d postgres -Atc 'select 1'   # şifre SORMADAN → 1

# 2) Eski script'in yedeği (cron'a henüz dokunulmadı)
cp -p /usr/local/bin/supabase-yedek.sh /usr/local/bin/supabase-yedek.sh.bak

# 3) Yeni script'i ELLE bir kez koştur
bash /opt/build/sendika-site/scripts/backup-db.sh; echo "exit=$?"       # 0
tail -n 1 /var/backups/supabase/yedek.log                               # durum=OK … public=20/20
F=$(ls -t /var/backups/supabase/yedek-*.dump | head -n 1)
pg_restore -l "$F" | grep -E 'Format|Compression|TABLE DATA auth users|ACL public FUNCTION is_super_admin'
pg_restore -l "$F" | grep -c ' TABLE DATA public '                      # 20
ls -l "$F"                                                              # -rw------- (600)

# 4) Cron satırını değiştir
crontab -l | grep -n yedek                                              # eski satırı gör
crontab -e
#   ESKİ (…/usr/local/bin/supabase-yedek.sh…) → silin
#   YENİ:
#   0 4 * * * /bin/bash /opt/build/sendika-site/scripts/backup-db.sh >> /var/log/supabase-yedek.log 2>&1

# 5) Eski .sql.gz'ler 14 gün geçerli yedek olarak kalır (yeni script süresi
#    dolunca onları da siler). İçlerinde şifre hash'leri var → izni daralt:
chmod 600 /var/backups/supabase/yedek-*.sql.gz

# 6) Ertesi sabah
tail -n 2 /var/backups/supabase/yedek.log
tail -n 20 /var/log/supabase-yedek.log

# 7) Birkaç gece OK geldikten sonra — eski script'te ve .bak'ta şifre DÜZ METİN:
rm /usr/local/bin/supabase-yedek.sh /usr/local/bin/supabase-yedek.sh.bak
```

**Risk:** düşük — pg_dump salt okurdur, değişiklik yalnız
`/var/backups/supabase`'e yazılan dosyayı etkiler. Yeni script başarısız
olursa HATA satırı yazar, çıkış 1 verir ve **eski yedekleri silmez**.

## Geri yükleme araçları

### `scripts/restore-storage.mjs` — storage aynası → bucket

```bash
node scripts/restore-storage.mjs --env /root/tatbikat.env --hedef <test-ref>            # RAPOR
node scripts/restore-storage.mjs --env /root/tatbikat.env --hedef <test-ref> --yukle    # YÜKLE
#   --kaynak <dizin> (varsayılan /var/backups/storage)   --onek <tenant-uuid>
#   --silinenler-dahil <YYYY-AA-GG>
```
- `--env` ve `--hedef` **zorunlu**; env'deki URL'in ref'i `--hedef` ile aynı
  değilse **hiçbir şey yapmadan** çıkış 2. `.env` / `.env.local`
  kendiliğinden okunmaz (VPS'teki `.env` CANLIYI gösterir); ortam
  değişkenleri yok sayılır.
- Varsayılan RAPOR. Aynı yol + aynı boyut → atla; boyut farklı →
  **ÇAKIŞMA, üzerine yazılmaz**; eksik → yükle (stream, `x-upsert: false`,
  içerik tipi uzantıdan, cache 3600, 4 paralel; 5xx/429/ağ → 3 deneme;
  409 → atlandı; boyut sınırı ayrı sayılır — Free planda dosya başına 50 MB).
- `_silinenler/`, `yedek.log`, `.part`, nokta dosyaları hariç.
  `--silinenler-dahil <tarih>`: o tarih ve sonrasında silinenler orijinal
  yollarına döner (aynı yol birden çok günde → en yeni; aynada da varsa ayna
  kazanır). **Ne zaman:** N gün önceki DB dökümü yükleniyorsa, o günden sonra
  silinen dosyaları DB hâlâ gösterir → `--silinenler-dahil <dökümün tarihi>`.
- Bucket **oluşturulmaz** (yoksa KURULUM Adım 4). Sonda hedef yeniden
  listelenir; sayı + boyut aynayla karşılaştırılır.
- Çıkış: 0 tamam; 1 hata / çakışma / boyut sınırı / doğrulama farkı; 2
  kullanım / hedef hatası. Mantık `scripts/lib/storage-restore.mjs`.
- Test `npm run test:restore` **72/72**; mutasyon (çakışanı yüklemek, kısa
  sayfada durmak, ref kontrolünü kaldırmak) → FAIL. **Salt okuma** canlı
  kontrol: canlı bucket listesi **76 dosya** (storage yedek log'u `uzak=76` ile
  aynı). Yükleyici canlıya karşı denenmedi (canlıya yazardı); ✅ ilk gerçek
  koşum tatbikatta (11 Eylül): 76/76 yüklendi, hata 0, 2. koşum 0 yükleme.

### `scripts/rewrite-storage-urls.mjs` — DB'deki storage adresleri → yeni proje

```bash
node scripts/rewrite-storage-urls.mjs --env /root/tatbikat.env --eski jqwmnawzehyvpwrtdvku --yeni <test-ref>        # RAPOR
node scripts/rewrite-storage-urls.mjs --env /root/tatbikat.env --eski jqwmnawzehyvpwrtdvku --yeni <test-ref> --yaz  # UYGULA
```
- **Neden şart:** görseller DB'de tam adresle durur
  (`https://<ref>.supabase.co/storage/v1/object/public/images/...` —
  getPublicUrl çıktısı). Host kontrolleri joker (`*.supabase.co`: next/image,
  CSP, sanitize) → yeni projede eski adresler **hata vermeden** eski projeden
  yüklenir: tatbikatta **sahte başarı**, gerçek felakette kırık görsel.
- public şemadaki TÜM metin / jsonb / dizi kolonları taranır (tablolar
  PostgREST OpenAPI'sinden — ileride eklenenler de); **HTML içindeki
  adresler dahil**. Yalnız `https://<eski>.supabase.co/storage/v1/` öneki
  değişir; eski ref'in başka biçimdeki geçişleri "DOKUNULMAYAN" diye raporlanır
  (çıkış 1 — elle bakılmalı). Yalnız değişen kolonlar, PK ile güncellenir;
  `updated_at` değişmez (tenants dışında trigger yok).
- `--yeni` = bağlanılan proje: env'deki ref `--yeni` değilse çıkış 2 (bir DB
  yalnız KENDİ storage'ını gösterecek şekilde dönüştürülür — ayrı `--hedef`
  gereksiz). `--yaz` sonrası yeniden taranır: eski önekli adres 0 olmalı.
- **Canlı ölçüm (RAPOR, yazma yok):** 20 tablo; 9 kolonda 28 satırda **30
  adres** — `news.cover_image` 9, `content_media.url` 5,
  `homepage_section_items.image_url` 5, `sliders.image_url` 5,
  `headlines.image_url` 2, `news.content` (HTML) 1, `pages.cover_image` 1,
  `pages.video_url` 1, `site_settings.value` (logo) 1; dokunulmayan 0.
  ✅ Tatbikatta (11 Eylül) `--yaz`: aynı 30 adres dönüştürüldü, yeniden
  tarama 0; uygulamanın HTML'inde canlı ref yok.
- Test `npm run test:rewrite-urls` **42/42**; mutasyon (yalnız ilk adresi
  değiştirmek, jsonb'yi atlamak, RAPOR'da yazmak, ref kontrolünü kaldırmak) →
  FAIL. Mantık `scripts/lib/storage-url-rewrite.mjs`; ortak hedef guard'ı
  `scripts/lib/target-env.mjs`.

## Geri yükleme sırası (boş Supabase projesine)

Şema **baseline'dan**, veri **yedekten** (ikisi birden şema kurarsa her
CREATE çakışır; baseline tatbikatla kanıtlı — ACL, rol bazlı REVOKE'lar
(Bölüm D) ve 4 storage policy içinde).

1. Proje — aynı bölge (eu-west-1), PostgreSQL 17. Bağlantı host'u için
   aşağıdaki "Pooler host'u" notuna bakın (`aws-0` / `aws-1`).
2. `000_baseline.sql` → KURULUM Adım 11'in 10 sorgusu (5, 6, 10 bu aşamada
   boş döner — tohum çalıştırılmaz, veri 6. adımda gelir).
3. **`001_seed_default.sql` ÇALIŞTIRILMAZ** — varsayılan kurum yedekte; aynı UUID çakışır.
4. **Süper admin (KURULUM Adım 5) oluşturulmaz** — yedekten gelir; önceden
   açılırsa e-posta/ID çakışır.
5. Bucket: yedekteki `storage.buckets` satırı (ayarlar birebir) ya da KURULUM Adım 4.
6. Veri: `auth.users` + `auth.identities` + public'in 20 tablosu — **tek
   transaction, `SET session_replication_role = replica`** (TOC ada göre
   sıralı, FK sırası kendiliğinden sağlanmaz; Supabase'in kendi taşıma
   rehberindeki yöntem). Trigger'lar (yalnız tenants'ta, BEFORE UPDATE) veri
   yüklemede zaten çalışmaz; sequence yok. auth'un geri kalanı (sessions,
   refresh_tokens, one_time_tokens, schema_migrations…) YÜKLENMEZ.
   `storage.objects` satırları YÜKLENMEZ — dosyasız hayalet nesne olur,
   aynı yola upload 409 verir; upload satırı kendisi oluşturur (policy'ler
   yol tabanlı, `owner`'a bakmaz → kurum adminleri geri yüklenen dosyaları silebilir).
7. URL dönüşümü.
8. Storage dosyaları.
9. Doğrulama + uçtan uca.

**Supabase kısıtları — ✅ tatbikatta doğrulandı (11 Eylül 2026):** postgres
rolü auth tablolarına COPY yapabildi ve `session_replication_role`
ayarlayabildi (adım 3 tek transaction, exit 0). bcrypt hash'leri taşındı →
süper admin canlıdaki şifresiyle girdi; JWT secret farklı → herkes yeniden
giriş yapar (beklenen). Aşağıdaki yedek yollara gerek kalmadı; olmasaydı:
(a) replica yerine `pg_restore --section=pre-data` → `--section=data` →
`--section=post-data` (kısıtlar veriden SONRA — şema o zaman yedekten gelir;
yeni yedek ACL'li olduğu için güvenli; storage policy'leri baseline Bölüm
C'den); (b) kullanıcılar için Admin API
`createUser({ id, email, password_hash, email_confirm })` — UUID'ler korunmalı
(`tenant_users` onlara bağlı).

## ⚠️ Pooler host'u projeye göre değişir — `aws-0` / `aws-1` (11 Eylül 2026)

Tatbikat projesi (`sendika-tatbikat2`, eu-west-1) session pooler'da
**`aws-1-eu-west-1.pooler.supabase.com`** üzerindeydi; canlı proje
**`aws-0-eu-west-1.pooler.supabase.com`**. Supabase yeni projeleri `aws-1`'e
açıyor olabilir — bölge aynı olsa da host tahmin edilemez.

- Bağlantı kurarken **Dashboard → Connect → Session pooler**'daki host
  **birebir** kullanılır. `.pgpass` satırı, `PGHOST` ve `BASELINE_PGURI` aynı
  host'u taşımalı (`.pgpass` host alanını harf harf eşleştirir).
- Bu NOTE'taki, KURULUM.md'deki (Adım 2, 3, 10) ve script örneklerindeki
  `aws-0` **canlı projeye** aittir; yeni bir projeye kopyalanmaz.
  `scripts/backup-db.sh`'in varsayılan `PGHOST`'u da canlı proje içindir —
  başka projede `PGHOST` ortamdan verilir.

## ✅ Tatbikat planı (boş test projesi — canlıya YAZMA YOK) — 11 Eylül 2026'da uygulandı

| # | Adım | Doğrulama |
|---|---|---|
| 1 | Test projesi aç; Auth: Site URL `http://lvh.me:3000`, lvh.me Redirect satırları, signup kapalı | — |
| 2 | Baseline | KURULUM Adım 11'in **10 sorgusu, 10'u kaydedilir** (süreç kuralı). Geri yüklemede 5, 6, 10 boş döner (tohum çalıştırılmaz, veri 3. adımda gelir); 4 → `f` |
| 3 | Bucket + auth verisi + public verisi (`ON_ERROR_STOP`, tek transaction) | **0 hata**. Dökümdeki COPY satır sayıları ↔ her tablonun `count(*)`'u **birebir** (20 public + auth.users + auth.identities). Yetim satır 0 |
| 4 | URL dönüşümü | Eski ref geçen kolon **0** |
| 5 | restore-storage: rapor → `--yukle` → tekrar | 2. koşum 0 yükleme; bucket = ayna; DB'nin gösterdiği **her** storage adresi test projesinden 200 |
| 6 | Uygulamayı test projesine bağla | Ortam değişkenleriyle `npm run dev` — Next, ayarlı ortam değişkenini `.env.local` ile ezmez; `.env.local`'e dokunulmaz. ÜÇÜ de verilmeli: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| 7 | Uçtan uca | Kendi şifrenle süper admin girişi + kurumlar listesi; bir kurum admini girişi; default ve kurmay sitesi (lvh.me): haberler, galeri, video; DevTools'ta **görsellerin host'u test projesi** (canlı değil); panelden görsel yükle + sil |
| 8 | Süre ölç, buraya yaz | ✅ **RTO ~1 saat** (11 Eylül: adım adım, komutlar NOTE'tan okunarak); **RPO ≤ 24 saat** (gece 04:00 cron) |
| 9 | **Temizlik** | Test projesi silinir — içinde gerçek kişisel veri var (e-postalar, şifre hash'leri, iletişim mesajları; KVKK). VPS'teki `/root/tatbikat-*` dosyaları ve `/root/.pgpass`'teki test satırı silinir |

E-posta akışları (davet, sıfırlama) tatbikata girmez — test projesinde SMTP yok.

**Komutlar** (VPS, root). Adım 3'ün komutları yerel PostgreSQL 17.11'de
sınandı (FK hatası replica'sız, geçiş replica'lı, sayım karşılaştırması,
yetim kontrolü, adres çıkarımı); ✅ 11 Eylül tatbikatında Supabase'e karşı
koşuldu — hepsi beklenen sonucu verdi (aşağıda "✅ Tatbikat sonucu").

```bash
# Hazırlık: test projesinin şifresi /root/.pgpass'e İKİNCİ satır olarak
#   <pooler-host>:5432:postgres:postgres.<test-ref>:<test-şifre>
#   <pooler-host> = test projesinin Dashboard → Connect → Session pooler host'u,
#   BİREBİR (11 Eylül: aws-1-eu-west-1.pooler.supabase.com; canlı aws-0 —
#   yukarıdaki "Pooler host'u" notu)
# ve /root/tatbikat.env (chmod 600):
#   NEXT_PUBLIC_SUPABASE_URL=https://<test-ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=<test projesinin service_role anahtarı>
export PGHOST=<pooler-host> PGPORT=5432 PGDATABASE=postgres PGSSLMODE=require
export PGUSER=postgres.<test-ref>
F=$(ls -t /var/backups/supabase/yedek-*.dump | head -n 1)
cd /opt/build/sendika-site && umask 077

# 2) Şema
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/000_baseline.sql
#    → KURULUM Adım 11'in 10 sorgusu; 10'unun sonucu kaydedilir

# 3) Bucket + veri — tek transaction, FK sırası için replica
#    (çıktıdaki "set_config" satırları normal)
pg_restore --data-only --no-owner -n storage -t buckets          -f /root/tatbikat-bucket.sql "$F"
pg_restore --data-only --no-owner -n auth -t users -t identities -f /root/tatbikat-auth.sql   "$F"
pg_restore --data-only --no-owner -n public                      -f /root/tatbikat-public.sql "$F"
psql -X -q -v ON_ERROR_STOP=1 --single-transaction \
  -c 'SET session_replication_role = replica' \
  -f /root/tatbikat-bucket.sql -f /root/tatbikat-auth.sql -f /root/tatbikat-public.sql > /dev/null
echo "exit=$?"                                                     # 0

# 3-doğrulama) Dökümdeki satır sayıları ↔ veritabanı
for sel in "-n public" "-n auth -t users -t identities"; do
  pg_restore --data-only $sel -f - "$F"
done | awk '/^COPY /{t=$2;n=0;next} /^\\\.$/{if(t!="")print t, n;t="";next} t!=""{n++}' \
  | sort > /root/tatbikat-dokum-sayim.txt
psql -X -q -At -F ' ' <<'SQL' | sort > /root/tatbikat-db-sayim.txt
SELECT n.nspname || '.' || c.relname,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND (n.nspname = 'public' OR (n.nspname = 'auth' AND c.relname IN ('users', 'identities')));
SQL
diff /root/tatbikat-dokum-sayim.txt /root/tatbikat-db-sayim.txt && echo "SAYIMLAR BİREBİR"

# 3-yetim) replica FK'yı yükleme boyunca kapattı — auth'a bağlı FK'lar
psql -X -q -At <<'SQL'
SELECT 'tenant_users→auth.users', count(*) FROM public.tenant_users t LEFT JOIN auth.users u ON u.id = t.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'super_admins→auth.users', count(*) FROM public.super_admins s LEFT JOIN auth.users u ON u.id = s.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'identities→auth.users', count(*) FROM auth.identities i LEFT JOIN auth.users u ON u.id = i.user_id WHERE u.id IS NULL;
SQL
#    (döküm tek bir tutarlı anlık görüntüden alındığı için public içi FK'lar da
#    tutarlıdır; sayımlar birebir ise eksik yükleme yok)

# 4) URL dönüşümü
node scripts/rewrite-storage-urls.mjs --env /root/tatbikat.env --eski jqwmnawzehyvpwrtdvku --yeni <test-ref>
node scripts/rewrite-storage-urls.mjs --env /root/tatbikat.env --eski jqwmnawzehyvpwrtdvku --yeni <test-ref> --yaz

# 5) Storage
node scripts/restore-storage.mjs --env /root/tatbikat.env --hedef <test-ref>
node scripts/restore-storage.mjs --env /root/tatbikat.env --hedef <test-ref> --yukle
node scripts/restore-storage.mjs --env /root/tatbikat.env --hedef <test-ref>         # yüklenecek 0

# 5-doğrulama) DB'nin gösterdiği HER storage adresi test projesinden 200 mü?
psql -X -q -At <<'SQL' | sort -u > /root/tatbikat-adresler.txt
CREATE TEMP TABLE adres(u text);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format(
      $q$INSERT INTO adres SELECT (regexp_matches(t::text, 'https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/[^"''<>()\s,]+', 'g'))[1] FROM public.%I t$q$,
      r.tablename);
  END LOOP;
END $$;
SELECT DISTINCT u FROM adres;
SQL
wc -l < /root/tatbikat-adresler.txt                                  # ~30
grep -v '<test-ref>' /root/tatbikat-adresler.txt                     # BOŞ olmalı
while read -r u; do c=$(curl -s -o /dev/null -w '%{http_code}' "$u"); [ "$c" = 200 ] || echo "$c $u"; done < /root/tatbikat-adresler.txt   # BOŞ olmalı

# 9) Temizlik
rm -f /root/tatbikat-*            # + /root/.pgpass'teki test satırı, test projesi (Dashboard)
```

## ✅ Tatbikat sonucu (11 Eylül 2026) — TAM BAŞARILI

**Ortam:** boş test projesi `sendika-tatbikat2` (ref `rhkijqdfmeczqjwqkpnz`,
eu-west-1, session pooler **`aws-1`**-eu-west-1 — canlı `aws-0`, yukarıdaki
not). **Yedek:** `/var/backups/supabase/yedek-2026-09-11_040001.dump` — yeni
custom format script'in ilk cron koşumu. Canlıya yazma yok.

**Adım 2 — baseline** (BUG 3 sonrası yeniden üretilen, 26 kontrol OK,
`233c1af`): **0 hata**. KURULUM Adım 11 — **10 sorgunun 10'u** (süreç kuralı):

| # | sorgu | sonuç | |
|---|---|---|---|
| 1 | public tablo sayısı | 20 | ✅ |
| 2 | RLS kapalı tablo | 0 | ✅ |
| 3 | `is_super_admin` `super_admins` okuyor, `raw_user_meta_data` yok | t | ✅ |
| 4 | anon `is_super_admin`'i çağırabiliyor mu | **f** | ✅ **BUG 3 düzeltmesi kanıtlandı** |
| 5 | default tenant | boş | ✅ tohum çalıştırılmadı (doğru — veri yedekten) |
| 6 | site_settings / menu_items | 0 / 0 | ✅ aynı sebep |
| 7 | news / announcements | 0 / 0 | ✅ demo sızmamış |
| 8 | storage policy | 4 | ✅ |
| 9 | 7 kayıp kolon | 7 | ✅ |
| 10 | super_admins | 0 | ✅ veri yedekten gelecek (adım 3) |

**Adım 3 — veri:** `pg_restore` ile 3 dosya (storage.buckets; auth.users +
identities; public), tek transaction + `SET session_replication_role =
replica` → **exit 0**. Döküm satır sayıları ↔ DB `count(*)`: **SAYIMLAR
BİREBİR**. Yetim: tenant_users→auth.users 0, super_admins→auth.users 0,
identities→auth.users 0.

**Adım 4 — URL dönüşümü:** RAPOR 20 tablo, 9 kolonda 28 satır / **30 adres**,
dokunulmayan 0 — `content_media.url` 5, `headlines.image_url` 2,
`homepage_section_items.image_url` 5, `news.content` 1 (HTML içinde),
`news.cover_image` 9, `pages.cover_image` 1, `pages.video_url` 1,
`site_settings.value` 1, `sliders.image_url` 5 (canlı ölçümle birebir).
`--yaz` sonrası yeniden tarama: **0 adres**.

**Adım 5 — storage:** ayna 76 dosya (35.7 MB), `_silinenler` 48, hariç tutulan
1. `--yukle`: yüklendi **76**, hata 0, boyut sınırı 0. Son doğrulama: eksik 0,
boyut farkı 0, fazladan 0. İkinci RAPOR: yüklenecek 0, atlanacak 76
(artımlılık doğrulandı).

**Adım 5-doğrulama:** DB'nin gösterdiği **28 benzersiz adres**; hiçbiri canlıyı
göstermiyor, **hepsi 200**.

**Adım 6-7 — uygulama:** `/opt/tatbikat-app`'e kopyalandı, test projesinin
`.env`'iyle build alındı, port 3001. Anasayfa açıldı, görseller göründü,
**süper admin girişi çalıştı** (şifre hash'leri yedekten geldi — canlıdaki
şifre geçerli), `/super-admin` kurumlar listesi göründü. `curl` ile HTML
taraması: sayfada yalnız `rhkijqdfmeczqjwqkpnz.supabase.co`, **canlı ref yok**.
Plan satır 7'nin şu maddeleri bu kayıtta geçmiyor: kurum admini girişi,
kurmay (lvh.me) sitesi, panelden görsel yükle + sil.

**Adım 8 — RTO / RPO:** **RTO ~1 saat** — tatbikatın toplam süresi, adım adım
ve komutlar bu NOTE'tan okunarak (gerçek felakette boşluk 8'deki proje
ayarları — Auth URL'leri, SMTP, e-posta şablonları — ve canlı deploy bunun
üstüne eklenir). **RPO ≤ 24 saat** (gece 04:00 cron).

**Adım 9 — temizlik:** uygulama durduruldu, ufw 3001 kapatıldı,
`/opt/tatbikat-app` ve `/root/tatbikat-*` silindi, `.pgpass`'ten test satırı
çıkarıldı, Supabase projesi silindi.

## Tespit edilen boşluklar (11 Eylül 2026)

| # | Boşluk | Durum |
|---|---|---|
| 1 | DB yedeğinin şema kapsamı bilinmiyordu (`-n public` ise auth.users yok) | ✅ Ölçüldü: tam döküm, auth dahil. Yeni script açık şema listesiyle alıyor |
| 2 | `--no-acl` + plain format (şema yedekten kurulamaz, seçici yükleme yok) | ✅ `scripts/backup-db.sh` (custom, ACL dahil) — cron'da; ilk koşumu (11 Eylül 04:00) tatbikatta kullanıldı |
| 3 | Görseller DB'de tam URL, host kontrolleri joker → yeni projede sessizce eski projeden | ✅ `rewrite-storage-urls.mjs` — tatbikatta 30 adres → yeniden tarama 0; sayfada canlı ref yok |
| 4 | Storage geri yükleme aracı yok | ✅ `restore-storage.mjs` — tatbikatta 76/76, hata 0, 2. koşum 0 |
| 5 | Yedekler uygulamayla aynı VPS'te; service_role anahtarı ve DB şifresi de orada | 📋 BACKLOG (aşağıda) |
| 6 | DB yedek script'i repoda yok, şifre düz metin | ✅ Repoda, şifre `.pgpass`'te, cron'da — **eski script'in silinmesi bekliyor** (cron geçişi 7. adım: birkaç gece OK sonrası; eski script ve `.bak`'ta şifre düz metin) |
| 7 | Yedek başarısızlığı kimseye bildirilmiyor (yalnız log) | 📋 BACKLOG (aşağıda) |
| 8 | Proje ayarları yedekte değil: Auth URL'leri (custom domain satırları dahil), SMTP, e-posta şablonları, OTP süresi, API anahtarları | Belgeli (KURULUM + NOTE). Yeni projede anahtarlar değişir → `.env` + **yeniden build** (`NEXT_PUBLIC_*` build'e gömülü) + deploy. Tatbikat kontrol listesinde |
| 9 | Canlı projenin Supabase planı kayıtlı değil | ❓ Açık: Pro ise Supabase'in kendi günlük yedeği de var (Dashboard'dan) — bizim yedeğin yanına, yerine değil; Free ise yok |
| 10 | **Baseline rol bazlı REVOKE'u taşımıyor** (tatbikat adım 2, 11 Eylül): yüklenen projede `anon` `is_super_admin`'i çağırabiliyor, canlıda çağıramıyor (BUG 3) | ✅ **KAPATILDI** — script düzeltildi (Bölüm D, 26 kontrol, `6ab8730`), baseline yeniden üretildi (`233c1af`), tatbikatta sorgu 4 → `f`. Kök neden + çözüm: "🧪 TATBİKAT 3 / BUG 3" |
| 11 | Pooler host'u projeye göre değişiyor (tatbikat projesi `aws-1`, canlı `aws-0`); NOTE / KURULUM / script örnekleri `aws-0` yazıyor | 📋 Belgelendi ("Pooler host'u" notu, yukarıda) — örnekler canlı projeye ait, yeni projede Dashboard'daki host kullanılır |

---

# 📋 BACKLOG — Yedekler uygulamayla aynı sunucuda; sunucu dışı kopya yok (11 Eylül 2026)

**Durum:** ⚠️ Açık — bu turda uygulanmadı ("Yedekten geri yükleme"
teşhisinin 5. boşluğu).

DB dökümleri (`/var/backups/supabase`) ve storage aynası
(`/var/backups/storage`) uygulamayla **aynı VPS'te**. Aynı sunucuda
service_role anahtarı (`/opt/build/sendika-site/.env`) ve DB şifresi
(`/root/.pgpass`) da duruyor.

- **Disk / sağlayıcı kaybı:** yedekler gider. Supabase'deki veri kalır — tek
  arıza veri kaybettirmez, ama ikinci bir kopya da kalmaz.
- **Sunucu ele geçirilirse:** saldırgan service_role anahtarıyla Supabase
  verisini VE yerel yedekleri silebilir — iki kopya birlikte gider. Asıl risk bu.

**Çözüm yönü:** yedeklerin sunucu dışında, **VPS'in silemeyeceği** bir
kopyası. Seçenekler: nesne kilitli (object lock / immutability) harici bir
bucket'a gece kopyası; ya da kopyayı başka bir makinenin VPS'ten **çekmesi**
(pull — VPS'te o hedefe yazma/silme yetkisi olmaz). Şifreleme (dökümlerde
şifre hash'leri ve kişisel veri var) ve saklama süresi birlikte düşünülmeli.

---

# 📋 BACKLOG — Yedek başarısızlığı kimseye bildirilmiyor (11 Eylül 2026)

**Durum:** ⚠️ Açık — bu turda uygulanmadı ("Yedekten geri yükleme"
teşhisinin 7. boşluğu).

İki yedek de sonucu yalnız log'a yazıyor (`/var/backups/supabase/yedek.log`,
`/var/backups/storage/yedek.log`, cron çıktıları `/var/log/*-yedek.log`).
Çıkış kodu 1 kimseye ulaşmıyor; cron hiç çalışmazsa (sunucu saati, crontab
silinmesi, disk dolu) hiçbir satır da yazılmıyor. Yedekler haftalarca sessizce
durabilir — ancak geri yükleme gerektiğinde fark edilir.

**Çözüm yönü:** "başarı sinyali gelmezse alarm" (dead-man's switch): her
başarılı koşumun sonunda harici bir izleme adresine ping; sinyal
belirlenen sürede gelmezse e-posta. Yalnız "hata olunca e-posta" yetmez — cron
hiç çalışmadığında hata da oluşmaz. `backup-db.sh` ve `backup-storage.mjs`
başarıda ping atacak şekilde genişletilir.

---

# 🧭 KURULUM DURUMU — Yeni kurum kurulum kontrol listesi (11 Eylül 2026)

**Durum:** ✅ Uygulandı — tsc + build + lint + 8 test script'i geçti
(`npm run test:setup` 185 kontrol). Canlı manuel test (tablo aşağıda)
**bekliyor**.

**Neden:** yeni müşteri kurulumunun bir kısmı kod dışında (DNS, Nginx, SSL,
Supabase Dashboard) ve unutuluyordu. Kurmay'da Supabase Redirect URLs satırı
atlanmıştı → custom domain'de şifre sıfırlama sessizce çalışmıyordu (bkz.
"✅ KAPATILDI — Custom domain'li kurumlarda şifre sıfırlama"). KURULUM.md'yi
kimse açmıyor; durum panelde görünür olmalı.

## Nerede / nasıl

- **tenants/[id] sayfasının en üstünde "Kurulum Durumu" bölümü.** Kayıttan
  sonra tenants/yeni zaten buraya yönlendiriyor. Başlıkta özet ("1 eksik" /
  "Tamam"); eksik varsa kendiliğinden açılır, eksikli maddenin hazır metni de
  açık gelir. Ayrı sayfa / menü öğesi yok.
- **Onay kutusu / DB kaydı YOK.** Her madde her açılışta yeniden ölçülür —
  elle işaretlenen "yapıldı" niyeti saklar, gerçeği değil, zamanla bayatlar.
  Ölçülemeyen madde **"Belirlenemedi"** olur, asla sahte "Tamam".
- **Custom domain değiştirilince / silinince** kayıttan sonra pencere açılır
  (overlay / Esc ile kapanmaz, "Anladım" kapatır): silinecek eski Supabase
  satırları, eklenecek yeniler, sunucu temizliği (nginx blokları → reload →
  `certbot delete` EN SON). İlk kez girilen domain'de pencere yok (adımlar
  zaten bölümde). Eski domain DB'de saklanmaz — pencere kapanınca hatırlatma
  biter (bilinçli).

## Maddeler ve kaynakları

| Grup | Madde | Nasıl ölçülür |
|---|---|---|
| Kurum ve subdomain | Kurum aktif | DB `is_active` (pasif → Uyarı) |
| | Subdomain adresi | Canlı: `https://<slug>.<kök>/admin/giris` → 200 + `x-tenant-slug` = slug |
| | Platform sertifikası (wildcard) | Canlı TLS: bitiş tarihi + "kendiliğinden YENİLENMEZ" hatırlatması; 30 günden az → Uyarı |
| | Şifre sıfırlama dönüş adresi (subdomain) | Canlı Supabase yoklaması (wildcard satırı) |
| Admin | Admin davet edildi | `tenant_users` + Auth (yoksa Eksik) |
| | Davet kabul edildi (ilk giriş) | Auth `last_sign_in_at`; kimse girmediyse Uyarı + davet tarihi + "kaldırıp yeniden ekleyin" |
| Custom domain | DNS A kayıtları (apex + www) | Canlı: A = kök domain'in A kaydı (IP koda gömülmez); yabancı AAAA → Eksik |
| | SSL sertifikası (apex + www) | Canlı TLS: iki ad için geçerlilik + bitiş; 30 günden az → Uyarı (certbot 30 gün kala yeniler) |
| | Nginx apex bloğu | Canlı: `https://<d>/admin/giris` → 200 + doğru `x-tenant-slug` (DNS + sertifika + Nginx + kayıt uçtan uca) |
| | www → apex, http → https | Canlı: iki yönlendirme, 301/308 + hedef (302/307 → Uyarı) |
| | Supabase dönüş adresi | Canlı Supabase yoklaması |
| Kurum admininin işleri | Logo, İletişim, Haber Kategorileri, Site Menüsü, Anasayfa Bölümleri | DB — bilgi amaçlı; yalnız "Anasayfa Bölümleri = 0" Uyarı (public anasayfa boş görünür) |

Custom domain yoksa grup tek "Bilgi" maddesidir ("önce alana yazıp
kaydedin"). Bilinçli olarak listede yok: renk, favicon, sosyal medya
(boş / varsayılan bırakmak seçim olabilir — "eksik" saymak onay kutusu
tarlası olurdu), e-posta / storage / yedek (platform geneli, kurum başına iş
yok).

## Yoklamaların davranışı

- **Akış:** sayfa açılınca iki istek paralel — `GET
  /api/super-admin/tenant-setup-check?tenantId=` (DB/Auth, hızlı) ve
  `…&probe=1` (canlı). Yoklamalar paralel, her biri 5 sn zaman aşımlı (Kurmay
  için gerçek ağda ~1,7 sn). "Yeniden kontrol et" butonu; her kayıttan sonra
  da yeniden.
- **Supabase yoklaması:** `GET <SUPABASE_URL>/auth/v1/verify?type=recovery
  &token=kurulum-kontrolu-gecersiz-token&redirect_to=https://<d>/admin/davet-kabul`,
  yönlendirme takip edilmeden. Geçersiz token'da Supabase hatayı
  `redirect_to`'ya yollar; adres listede yoksa Site URL'e düşürür (GoTrue
  `GetReferrer` → `IsRedirectURLValid`). **11 Eylül canlı ölçüm:**

  | redirect_to | Yanıt |
  |---|---|
  | `https://kurmayteknoloji.com/admin/davet-kabul` | 303 → aynı adres `#error=…otp_expired` → **Tamam** |
  | `https://www.kurmayteknoloji.com/admin/davet-kabul` | 303 → aynı adres |
  | `https://kurmay-teknoloji.buyukdirilis.org.tr/admin/davet-kabul` | 303 → aynı adres (wildcard satırı) |
  | `https://listede-olmayan-ornek.com/admin/davet-kabul` | 303 → `https://buyukdirilis.org.tr#error=…` → **Eksik** |

  Yan etkisi yok: token geçersiz, kullanıcıya dokunmaz, mail gitmez (Supabase
  loglarında başarısız doğrulama olarak görünür); apikey gerekmez. Belgelenmiş
  API değil, kaynaktan okunmuş davranış — beklenmeyen yanıt / 429 →
  "Belirlenemedi".
- **Güvenlik (SSRF):** route yalnız `tenantId` alır, host her zaman DB'den;
  yalnız süper admin (oturumsuz → 401, yerelde doğrulandı); sabit yollar,
  yalnız 80/443; cevap gövdesi okunmaz. Domain özel / yerel IP'ye çözülürse
  hiç bağlanılmaz. **DNS kapısı:** A kaydı bu sunucuyu göstermeyen host'a
  TLS/HTTP yoklaması yapılmaz (başkasının sunucusunu ölçmemek için) → o
  maddeler "Belirlenemedi — DNS bu sunucuyu göstermiyor".
- **Yerel geliştirme (kök `lvh.me`):** DNS / TLS / Nginx yoklanmaz
  ("Belirlenemedi — yerel geliştirme"); Supabase yoklaması yerelde de gerçek
  sonuç verir.
- **Varsayım — hairpin:** canlıda yoklamalar sunucudan kendi public IP'sine
  gider. Sunucuda doğrulama: `curl -sI https://kurmayteknoloji.com/admin/giris
  | grep -i x-tenant-slug` → `x-tenant-slug: kurmay-teknoloji`. Çıkmazsa panel
  "Belirlenemedi" gösterir (sahte sonuç yok); o durumda yoklama 127.0.0.1'e
  SNI ile bağlanacak şekilde değiştirilir.

## Canlı ölçüm (11 Eylül, geliştirme makinesinden, gerçek ağ, gerçek yoklama kodu)

Kurmay için beklenen panel görüntüsü — **"1 eksik"**:
- ✅ DNS (apex + www → 185.33.234.67, AAAA yok) · ✅ SSL (7 Aralık 2026, apex
  + www) · ✅ Nginx apex (200, `x-tenant-slug: kurmay-teknoloji`) · ✅
  Supabase · ✅ Subdomain · ✅ Wildcard (24 Kasım 2026, 74 gün — elle
  yenilenecek)
- ❌ **www → apex:** `https://www.kurmayteknoloji.com/` **200** dönüyor, 301
  yok — canlı apex bloğunun `server_name` satırında www var (kullanıcı
  teyidi). `http://kurmayteknoloji.com/` → https 301 ✅ (certbot'un bloğu;
  `http://www…` ise `https://www…`'ya gidiyor). **Düzeltme:** paneldeki Nginx
  metni — apex bloğu www'suz + ayrı 301 bloğu tek dosyada; kurulum
  komutlarındaki `grep -Rn` eski blokları bulur.

## Hazır metinler (domain'den üretilir, Kopyala)

- **Supabase:** `https://<d>/admin/davet-kabul*` (ZORUNLU) +
  `https://www.<d>/admin/davet-kabul*` (savunma) — satır satır kopyalanır
  (Dashboard'da her URL ayrı alan).
- **DNS:** `A @ <IP>`, `A www <IP>` — IP kök domain'in A kaydından.
- **certbot:** `certbot certonly --nginx -d <d> -d www.<d>` + `certbot renew
  --dry-run --cert-name <d>`.
- **Nginx:** tam dosya `/etc/nginx/sites-available/<d>`, 3 blok: (1) apex →
  uygulama — canlıdaki bloğun aynısı (450M, `/_next/static/` immutable, proxy
  başlıkları) + `listen 443 ssl` + certbot SSL satırları, **server_name
  yalnız apex**; (2) www → apex 301; (3) 80 → https apex (apex + www).
  Komutlar: dosyaya yapıştır → `ln -s` → `grep -Rn "<d>"
  /etc/nginx/sites-enabled/` ile eski blokları bul, sil → `nginx -t &&
  systemctl reload nginx` (hepsi bitince tek seferde — arada site kesilmez).
- **Domain değişince:** eski satırlar (SİLİN) + yeni satırlar (EKLEYİN) +
  sunucu temizliği.

Kaynak: `src/lib/super-admin/setup-checklist.ts` (saf: metinler + durum
çevirimi + pencere içeriği), `setup-probes.ts` (yoklama; ağ bağımlılıkları
dışarıdan), `setup-probe-deps.ts` (Node DNS / TLS / fetch),
`api/super-admin/tenant-setup-check`, `components/super-admin/`
`SetupChecklist`, `CopyBlock`, `DomainChangeDialog`. update-tenant cevabı
artık kaydedilen (normalize) `customDomain`'i de döner. Custom Domain alanının
yardım metni Kurulum Durumu'na yönlendiriyor, örnek değer www'suz.

## ⏰ Manuel test

| # | Adım | Beklenen |
|---|---|---|
| 1 | Süper admin → Kurmay Teknoloji sayfası | Üstte "Kurulum Durumu", başlıkta **"1 eksik"** (kırmızı), bölüm **kendiliğinden açık**. Önce birkaç saniye "Kontrol ediliyor", sonra sonuçlar |
| 2 | "www → apex ve http → https yönlendirmesi" | **Eksik**: "https://www.kurmayteknoloji.com kendi başına açılıyor … server_name …"; hazır metin **kendiliğinden açık** (Nginx dosyası + komutlar) |
| 3 | Diğer custom domain maddeleri | DNS / SSL (7 Aralık 2026) / Nginx apex / Supabase → **Tamam** |
| 4 | Kurum ve subdomain | Subdomain **Tamam**; wildcard "24 Kasım 2026 … YENİLENMEZ"; subdomain Supabase **Tamam** |
| 5 | Kopyala | Supabase satırının Kopyala'sı → "Kopyalandı", yapıştırınca tek satır; Nginx dosyası tek parça kopyalanır |
| 6 | Sunucuda hairpin | `curl -sI https://kurmayteknoloji.com/admin/giris \| grep -i x-tenant-slug` → `kurmay-teknoloji` |
| 7 | Nginx'i panel metniyle düzelt → "Yeniden kontrol et" | www maddesi **Tamam**, başlık **"Tamam"** (yeşil), bölüm açık kalır. Tarayıcıda `https://www.kurmayteknoloji.com/haberler` → `https://kurmayteknoloji.com/haberler` |
| 8 | Custom domain'i olmayan bir kurum | Custom domain grubu tek **Bilgi** maddesi; özet onu saymaz |
| 9 | Test kurumu oluştur (custom domain yok) | Kurum sayfası: "Davet kabul edildi" **Uyarı** (henüz giriş yok, davet tarihi), Anasayfa Bölümleri **Uyarı**, kategoriler / logo **Bilgi** |
| 10 | O kuruma `deneme-yok.example` yaz, kaydet | Pencere **açılmaz** (ilk kez). Grup: DNS **Eksik** ("A kaydı yok"), sertifika / Nginx / yönlendirme **Belirlenemedi** ("DNS bu sunucuyu göstermediği için…"), Supabase **Eksik** (Site URL köküne düşüyor) |
| 11 | Domain'i başka bir değerle değiştir, kaydet | **Pencere açılır**: eski 2 satır SİLİN, yeni 2 satır EKLEYİN, sunucu temizliği; overlay tıklaması / Esc kapatmaz, "Anladım" kapatır |
| 12 | Domain alanını boşalt, kaydet | "Custom domain kaldırıldı" penceresi — yalnız silinecek satırlar + temizlik. Sonra test kurumunu silin |
| 13 | Oturumsuz `/api/super-admin/tenant-setup-check?tenantId=<uuid>` | 401 (yerelde doğrulandı) |

---

# ✅ KAPATILDI — E-posta şablonlarında bağlantı süresi çelişkisi (11 Eylül 2026)

**Durum:** ✅ **KAPATILDI** (11 Eylül 2026) — Dashboard'daki ayara bakıldı,
yanlış şablon canlıda düzeltildi. (Kurulum Durumu tasarımında bulunmuştu.)

**Ölçüm:** Supabase → Authentication → Sign In / Providers → Email →
**Email OTP Expiration = 3600 saniye (1 saat)**.

| Şablon | Metin | Sonuç |
|---|---|---|
| Reset Password | "Bağlantı 1 saat geçerlidir." | ✅ **Doğruydu** |
| Invite User | "Bu bağlantı 24 saat geçerlidir." | ❌ **Yanlıştı** → Dashboard'da **"1 saat"** olarak düzeltildi |

Bu dosyadaki şablon kaydı ("Sprint 1 Sonu Yapılacaklar" → 2. Invite User
Email Template) canlıyla eşitlendi. KURULUM.md'de şablon metni yok —
değişiklik gerekmedi.

**Karar: 3600 sn (1 saat) KALIYOR.** Davet için kısa, ama aynı ayar şifre
sıfırlamayı da belirliyor ve sıfırlama linkinin uzun ömürlü olması güvenlik
açısından istenmez. Süresi dolan davet panelden yeniden gönderilebiliyor
(11 Eylül'de test edildi); Kurulum Durumu'nun "Davet kabul edildi" maddesi de
kimse giriş yapmadıysa "süresi dolduysa kaldırıp yeniden ekleyin" ipucunu
veriyor. Kurulum Durumu süreyi koda gömmüyor — ayar değişirse yanlış
söylemesin diye yalnız davet tarihini gösteriyor.

## ⚠️ OTP süresi TEK ayardır — davet ve sıfırlama BİRLİKTE değişir

"Email OTP Expiration" Supabase'de **tek** bir değerdir; ayrı bir "davet
süresi" ayarı **yoktur**. Davet (Invite User) ve şifre sıfırlama (Reset
Password) bağlantıları aynı süreyle geçersizleşir (Auth kaynağı: verify
akışında ikisi de `config.Mailer.OtpExp`).

- **İleride "daveti uzatalım" denirse:** değer büyütüldüğünde **sıfırlama
  linkleri de uzar** — ele geçirilen ya da yanlış kişiye düşen bir sıfırlama
  maili daha uzun süre kullanılabilir. 1 saat bu yüzden bilinçli; süresi dolan
  davetin çözümü yeniden davet (panel), süreyi uzatmak değil.
- **Değer yine de değişirse:** iki şablonun metni de ("… saat geçerlidir")
  **aynı anda** güncellenmeli — yoksa bu çelişki geri gelir. Bu dosyadaki
  şablon kayıtları da.

---

# 🧱 MIGRATION BASELINE — 001-026 arşivlendi (10 Eylül 2026)

**Durum:** ✅ **TAMAMLANDI — baseline KANITLANMIŞ** (11 Eylül 2026).
Baseline BUG 3 düzeltmesiyle yeniden üretildi (19:52 UTC, 26 kontrol OK,
`233c1af`) ve geri yükleme tatbikatında boş bir Supabase projesine **0
hatayla** yüklendi; KURULUM Adım 11'in **10 sorgusunun 10'u** beklenen sonucu
verdi ve kayda geçti (sorgu 4 → `f`; aşağıda ⏰ ELLE madde 4). Önceki
adımlar: 001-026 arşive taşındı, 2. tur sıfırdan kurulum tatbikatı uçtan uca
geçti (⏰ ELLE madde 3). BUG 3 kaydı: aşağıda "🧪 TATBİKAT 3 / BUG 3".

## Sorun neydi

Repo'daki 25 migration dosyası **sırayla çalıştırıldığında boş bir
veritabanında çalışan bir şema üretmiyordu.** Altı kırılma noktası
(ayrıntı + dosya/satır referansları: `supabase/migrations/archive/README.md`):

1. `005` → `homepage_section_items`'a ALTER; tablo `025`'te yaratılıyor
2. `005` → `quick_access.slug/content/image_url/video_url/youtube_url`
   kolonlarını okuyor; **hiçbir migration bu kolonları yaratmıyor**
   (numara sırasındaki `006` boşluğu da buraya işaret ediyor)
3. `012:138` → `content_media` üzerinde policy; tablo `019`'da yaratılıyor
4. **`012` ↔ `019` karşılıklı bağımlılık** — 012'nin 019'a ihtiyacı var,
   019 ise 009/012'nin önce koşmuş olmasını varsayıyor. **Hiçbir dosya
   sıralaması ikisini birden memnun etmiyor** — asıl tıkanma bu
5. 7 kolon hiçbir migration'da yok (canlıda var, doğrulandı):
   `news`/`announcements` → `video_url`, `youtube_url`;
   `headlines` → `content`, `video_url`, `youtube_url`
6. `025` iki kez çalıştırılmak zorunda (kendi başlığında yazıyor)

Kök sebep hepsinde aynı: **tablolar Dashboard'dan elle yaratıldı, migration'a
sonradan geri yazıldı** (019 ve 025 bu drift'i kapatma denemeleriydi).
Tek tek yamamak madde 4'ü çözmüyor.

## Karar — canlı DB tek doğruluk kaynağı

Canlı şema `pg_dump --schema-only` ile dökülüp `000_baseline.sql` yapıldı.
001-026 `archive/`'a taşındı (tarihsel kayıt — okunur, çalıştırılmaz).

```
000_baseline.sql        şema (ÜRETİLMİŞ dosya, elle düzenlenmez)
001_seed_default.sql    minimum tohum (yalnızca yeni kurulum)
027_*.sql               yeni migration'lar buradan devam
archive/                001-026
archive/rollback/       013, 016, 018
```

**Neden numara 002'den değil 027'den devam ediyor:** `005`, `012`, `022` gibi
numaralar bu NOTE'ta ve kod yorumlarında onlarca kez geçiyor. Aynı numarayı
ikinci bir dosyaya vermek o referansları sessizce yanlış hale getirirdi.

**Baseline neden `--no-acl` ile alınmıyor:** tablo ve fonksiyon GRANT'ları ile
`022`'nin `REVOKE ... FROM PUBLIC`'i ACL'dir; `--no-acl` ile hepsi düşer.
ACL'ler bilerek dahil.

> ⚠️ **Düzeltme (BUG 3, 11 Eylül 2026):** bu paragraf eskiden "022'nin
> `REVOKE ... FROM PUBLIC/anon`'u ACL olarak baseline'a gelir" diyordu —
> **yanlıştı.** ACL'yi dahil etmek **yetmez**: pg_dump ACL'yi PostgreSQL'in
> sabit varsayılanına (`acldefault`: sahip + PUBLIC) göre **fark** olarak
> yazar; o varsayılanda olmayan bir rolün **yokluğunu** yazamaz. 022'nin
> `FROM anon` yarısı bu yüzden dump'a hiç girmedi; hedef projede Supabase'in
> ADP'si `anon`'a EXECUTE'u CREATE anında veriyor. O yarıyı artık script
> Bölüm D canlıdan üretiyor ("🧪 TATBİKAT 3 / BUG 3").

**`storage.objects` policy'leri neden ayrı:** Supabase'de `storage` şemasının
sahibi `supabase_storage_admin`; şemayı dumplamak Supabase'in kendi
tablolarını da getirir ve hedefte çakışır. Policy DDL'i `pg_policies`'ten
yeniden üretiliyor (script BÖLÜM C).

## Tohumda ne var, ne yok

`001_seed_default.sql` → **default tenant** (zorunlu: `get-tenant.ts:18-24`
bu satır yoksa `throw` eder, site komple açılmaz) + **10 site_settings** +
**5 menu_items**. Anahtar/menü kümesi `api/super-admin/create-tenant`
route'uyla birebir aynı tutuldu: elle kurulan default tenant ile panelden
kurulan tenant aynı yerden başlasın.

**Bilerek YOK:** demo haber/duyuru (eski `001`'deki uydurma içerikler
müşterinin canlı sitesinde yayınlanıyordu), `news_categories` (kuruma özel
taksonomi; panelden kurulan tenant'lar da kategorisiz başlıyor),
`homepage_sections`/`sliders`/`headlines` (tasarım kararı, hepsi boş duruma
dayanıklı), `super_admins` satırı (auth.users boşken FK ihlali —
KURULUM.md Adım 5).

## 🔑 BAKIM STRATEJİSİ — şema değişince ne yapılacak

**Karar: baseline DONDURULUR. Şema değişikliği her zaman YENİ migration'dır
(027, 028, ...). Baseline elle düzenlenmez.**

Gerekçe: baseline canlıya **bir daha uygulanmayacak** bir dosyadır. Şema
değişikliği baseline'a yazılırsa canlıya asla inmez → repo ile canlı yeniden
ayrışır. **Bu projeyi tam olarak buraya getiren hata budur.** Yeni migration
ise iki hedefi birden vurur: canlıya elle apply edilir, sıfırdan kurulumda
baseline'ın üstüne sırayla uygulanır.

Her yeni migration için akış:

1. `027_aciklayici_ad.sql` yaz — idempotent (`IF NOT EXISTS`,
   `DROP POLICY IF EXISTS`), başında ne/neden, sonunda doğrulama sorguları
2. Canlıya elle apply et (SQL Editor), doğrulama sorgularını çalıştır
3. NOTE.md'ye kaydet
4. Commit

**Baseline ne zaman yeniden üretilir:** biriken migration sayısı ~15'i
geçtiğinde, **veya** yeni bir müşteri kurulumundan hemen önce (kurulumun
adım sayısı azalsın), **veya** yılda bir.

Yeniden üretim ön şartı: **bekleyen tüm migration'lar canlıya uygulanmış
olmalı.** Aksi halde baseline yarım bir şemayı dondurur.

```bash
export BASELINE_PGURI='postgresql://postgres.<ref>:<sifre>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'
bash scripts/dump-baseline.sh   # -> ./000_baseline.sql + 26 doğrulama kontrolü
```

Sonra: yeni `000_baseline.sql` eskisinin üzerine yazılır, o tura kadarki
migration'lar `archive/`'a taşınır, numaralandırma kaldığı yerden devam eder
(sıfırlanmaz).

`scripts/dump-baseline.sh` çıktısını kendisi denetliyor: veri sızmış mı
(INSERT/COPY), 7 kayıp kolon yerinde mi, `is_super_admin` doğru sürüm mü
(`super_admins` okuyor mu, `raw_user_meta_data` değil), 022'nin
`FROM PUBLIC` REVOKE'u korunmuş mu, storage policy'leri gelmiş mi — 1.
tatbikattan beri: storage policy'lerindeki fonksiyon çağrıları şemalı mı,
`ALTER DEFAULT PRIVILEGES` satırı kalmış mı (aşağıda "TATBİKAT 1") — ve BUG
3'ten beri: canlıda `anon` `is_super_admin`'i çağıramıyor mu, Bölüm D
`anon`'un REVOKE'unu yazıyor mu, Bölüm D canlıdaki tüm fonksiyon
kısıtlarıyla (ham ACL'den bağımsız türetimle) birebir mi. Canlıda bir
tablo/sequence yetkisi Supabase varsayılanından kısıtlıysa script dosya
üretmeden durur (aşağıda "TATBİKAT 3 / BUG 3"). Bir kontrol bile düşerse
dosyayı repo'ya almayın.

## ⏰ ELLE — sırayla (✅ dördü de tamamlandı)

**1) Baseline'ı üret (VPS'te, pg_dump 17.11 orada kurulu)** — ✅ ilk üretim
10 Eylül 12:35 UTC, 23 kontrol OK (`497f446`; BUG 3'ü taşıyordu). **Güncel
üretim: madde 4** (11 Eylül, 26 kontrol).

```bash
export BASELINE_PGURI='postgresql://postgres.jqwmnawzehyvpwrtdvku:<sifre>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'
bash scripts/dump-baseline.sh "$BASELINE_PGURI" /tmp/000_baseline.sql
```

Tüm kontroller OK ise dosyayı repo'ya `supabase/migrations/000_baseline.sql`
olarak alın. Port **5432** (session pooler) — 6543'te pg_dump çalışmaz.

**2) Arşiv taşıması (lokalde, `git mv`)** — ✅ yapıldı (`3e136ba`).

**3) Sıfırdan kurulum tatbikatı — ✅ TAMAMLANDI (10 Eylül 2026, 2. tur).**
1. tur iki bug buldu (aşağıda "TATBİKAT 1"); script düzeltildi, baseline
yeniden üretildi, 2. tur KURULUM.md baştan sona izlenerek temiz geçti:

- Boş proje `sendika-test2` (PostgreSQL 17.6, Frankfurt)
- `pg_default_acl` (baseline'dan önce): **6 satır, canlıyla aynı** →
  `ALTER DEFAULT PRIVILEGES` satırlarını çıkarmak kayıpsız
- `000_baseline.sql` — `ON_ERROR_STOP=1 --single-transaction` → **0 hata**
- `001_seed_default.sql` → **0 hata**; yalnızca "already a transaction in
  progress" uyarısı (zararsız, veriler yazıldı — aşağıda, ✅ kapatıldı)
- Doğrulama: 20 tablo, **4 storage policy** (1. turda 1'di), default tenant
  + 10 ayar + 5 menü
- `images` bucket oluşturuldu; süper admin kaydı, `is_super_admin` → `true`
- Uygulama test DB'sine bağlandı (ayrı dizin `/opt/test-kurulum`, port
  3001): HTTP 200, `x-tenant-slug: default`
- Uçtan uca: süper admin girişi, tenant oluşturma, admin panelden haber +
  görsel yükleme, public sitede görüntüleme — **hepsi çalıştı**. Görsel
  yükleme tarayıcı istemcisiyle (anon key + oturum, service-role DEĞİL)
  yapıldığı için BUG 1'de kurulamayan `images_tenant_insert` policy'si
  gerçek yüklemede sınanmış oldu (izin yolu; tenant'lar arası ret yolu bu
  turda denenmedi).
- **Canlı kanıt — 8 Eylül'deki sessiz başarısızlık bug'ı kapalı:** tenant
  oluştururken geçersiz e-posta (`kl@gmail.com`) girildi → Supabase
  `email_address_invalid` (400) döndü ve panel bunu **doğru şekilde
  bildirdi**. Eskiden `tenants/yeni` API sonucuna bakmadan sabit "Admin'e
  davet gönderildi." yazıyordu (bkz. "🔴 CANLI BUG — Admin eklerken davet
  maili hiç gönderilmiyordu").
- Temizlik: test dizini silindi, firewall kuralı kaldırıldı, Supabase
  projesi silindi.

Bu turun kanıtı yükleme + uçtan uca çalışma içindi; o üretim BUG 3'ü
taşıyordu. Güncel statü: madde 4.

**4) BUG 3 sonrası yeniden üretim — ✅ TAMAMLANDI (11 Eylül 2026).**
VPS'te güncel script'le: 19:52 UTC, pg_dump 17.11 / sunucu 17.6, **26 × OK**,
Bölüm D'de tek satır `REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM anon;`
(`233c1af`; script düzeltmesi `6ab8730`). Aynı gün geri yükleme tatbikatında
boş projeye **0 hatayla** yüklendi; KURULUM Adım 11'in **10 sorgusunun 10'u**
beklenen sonucu verdi, sorgu 4 → **`f`** (tam tablo: "💾 YEDEKTEN GERİ
YÜKLEME" → "✅ Tatbikat sonucu").

**Baseline statüsü: ✅ KANITLANMIŞ** — yükleme, uçtan uca çalışma ve güvenlik
duruşu; 10/10 kayıtlı. Sonraki üretimler için komut: madde 1 (26 kontrol).

## 🧪 TATBİKAT 1 — 2 bug, ikisi de script'te düzeltildi (10 Eylül 2026)

Boş proje `sendika-test` (PostgreSQL 17.6), `000_baseline.sql` psql ile
yüklendi: **15 hata** (3 + 12).

> ✅ Düzeltilmiş script'le baseline yeniden üretildi (10 Eylül 12:35 UTC,
> 23 kontrol OK) ve 2. turda doğrulandı — iki hata da çıkmadı.

### BUG 1 (KRİTİK) — storage policy'lerinde şema öneki yoktu

`ERROR: function user_has_tenant_access(uuid) does not exist` →
`images_tenant_delete/insert/update` **oluşmadı**, yalnızca
`images_public_read` kuruldu. Yeni kurulumda storage tenant izolasyonu
olmayacaktı.

**Mekanizma — iki yarım, tek başına ikisi de zararsız:**
1. Bölüm C'nin ifadeleri `pg_policies.qual/with_check` = `pg_get_expr()`
   çıktısı. `pg_get_expr` bir nesneyi yalnızca **o anki search_path'te
   görünmüyorsa** şemayla yazar. Script'in psql oturumu canlı rolün
   search_path'iyle (`"$user", public, extensions`) çalıştı → `public.`
   düştü. (`storage.foldername` şemalı geldi: storage path'te yok.)
2. Yüklemede Bölüm B'nin başındaki pg_dump satırı
   `set_config('search_path', '', false)` oturumun **geri kalanını** boş
   search_path'e çekiyor → Bölüm C'deki şemasız ad çözülemiyor.

Canlıda sorun çıkmamasının sebebi: policy oluşunca fonksiyonu OID ile saklar;
ad çözümü yalnızca CREATE anında yapılır.

**Seçilen düzeltme: dump oturumunda `SET search_path = '';`** (Bölüm C
sorgusundan hemen önce). pg_dump'in Bölüm B için yaptığının aynısı — Bölüm
B'deki 16 policy'nin `public.user_has_tenant_access(...)`, 7'sinin
`public.is_super_admin(...)` diye şemalı gelmesinin sebebi bu. `pg_get_expr`
pg_catalog dışındaki **her** nesneyi (fonksiyon, operatör, tip; public,
extensions, auth...) şemasıyla yazar; isim listesi ya da regex yok.

Değerlendirilen alternatifler:
- **Qual metnine regex ile `public.` eklemek — reddedildi.** Hangi adın
  hangi şemada olduğunu bilmez (extensions'taki bir pgcrypto fonksiyonuna da
  `public.` yapıştırır), string literal'lerin içine dokunabilir (bu
  policy'lerde regex literal'i var), zaten şemalı adları ayırt etmek için
  SQL'i kaba bir parser'la yeniden yazmak gerekir; operatör/tipleri hiç
  kapsamaz. Tutulan isim listesi de yeni fonksiyonda sessizce eskir.
- **Baseline'a `SET search_path = public, ...` yazıp CREATE POLICY'yi öyle
  çalıştırmak — reddedildi.** Yükleme hatasını giderir ama adı **yükleme
  anında, hedefteki** path'e göre çözdürür: aynı adlı bir fonksiyon path'te
  önde duran bir şemada varsa policy ona bağlanır (search_path ele geçirme
  sınıfı, CVE-2018-1058 — RLS policy'sinde bu, tenant izolasyonu demek).
  Dump anındaki path'i tahmin edip dosyaya gömmek gerekir; dosya da okuyana
  hangi şemanın kastedildiğini söylemez.
- **`pg_dump -t storage.objects` + `pg_restore -L` ile yalnızca POLICY
  girdilerini süzmek — gereksiz.** Aynı deparse'ı verir (pg_dump da
  search_path='' + `pg_get_expr` kullanır) ama storage tablosunu kilitler,
  custom format ve ek adım getirir.

**`is_super_admin` kontrol edildi — etkilenmiyor.** Bölüm C'de hiç
çağrılmıyor; Bölüm B'deki tüm çağrıları (7 policy + `user_has_tenant_access`
gövdesi) zaten `public.` önekli. İki fonksiyon da `SET search_path TO
'public'` ile tanımlı → gövde içi ad çözümü çağıranın path'inden bağımsız
(storage API rolüyle çağrılınca da doğru). Tarama: baseline'daki 4 public
fonksiyonun yorum dışı tüm çağrıları — şemasız olan **yalnızca** Bölüm C'deki
4 satır (3 policy).

### BUG 2 (gürültü) — `ALTER DEFAULT PRIVILEGES`

Baseline'da 24 satır: 12'si `FOR ROLE postgres` (hatasız geçti), 12'si
`FOR ROLE supabase_admin` → `permission denied to change default privileges`
(postgres o role üye değil). SQL Editor ilk hatada tüm çalıştırmayı
durduruyor.

**Düzeltme:** script TEMİZLİK'e `-e '/^ALTER DEFAULT PRIVILEGES /d'` — 24'ü
de çıkar. **Emniyet:** sed'den önce awk, her eşleşmenin bir
`Type: DEFAULT ACL` pg_dump girdisinde olduğunu doğruluyor; değilse (ör.
plpgsql gövdesinde satır başında geçerli bir ifade) **hiçbir şey silmeden
durur** — sed onu da silip fonksiyonu sessizce bozardı.

**postgres'inkiler de neden çıktı:** hepsi yeni Supabase projesinde
varsayılan — silmek kayıpsız (hedefte aynı ADP zaten var). Burada eskiden
"baseline'ın kendi nesneleri etkilenmez (yetkileri ayrı GRANT satırlarıyla
geliyor)" yazıyordu — ⚠️ **YANLIŞTI (BUG 3):** baseline'ın nesneleri de
hedefin ADP'si altında yaratılır, `anon`/`authenticated`/`service_role`
yetkiyi CREATE anında alır; GRANT satırları yalnızca **ekler**. Canlıda daha
kısıtlı olan yetki ancak açık REVOKE ile gelir (script Bölüm D). 027+
migration'larda **GRANT'ı da REVOKE'u da açık yazın.** ✅ 2. turda doğrulandı: yeni projede
baseline'dan ÖNCE 6 satır, canlıyla aynı. Yeni kurulumlarda aynı kontrol:

```sql
SELECT pg_get_userbyid(d.defaclrole) AS rol, d.defaclobjtype AS tur, d.defaclacl
FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' ORDER BY 1, 2;
```

### Yeni doğrulama kontrolleri (20 → 23)

- `ALTER DEFAULT PRIVILEGES satiri yok` — satır başında hiç kalmamalı (BUG 2)
- `storage policy'leri public.user_has_tenant_access(...) cagiriyor` —
  Bölüm C'de şemalı çağrı var (BUG 1, pozitif)
- `storage policy'lerinde semasiz public fonksiyon cagrisi yok` — dump'taki
  **tüm** `CREATE FUNCTION public.*` adları Bölüm C'de öneksiz aranır; liste
  dump'tan geldiği için sonradan eklenen fonksiyonlar da kapsanır. Bulursa
  adını yazar (BUG 1, genel)

**Test:** stub `pg_dump`/`psql` (fixture'lar canlı dökümün kendisinden
türetildi), Git Bash + WSL Ubuntu (gawk ve mawk) — 32/32. Doğrulanan: eski
script iki hatayı da **exit 0** ile geçiriyordu; yeni çıktı eskisinden
yalnızca 24 ADP satırının silinmesi ve 4 policy satırına `public.`
eklenmesiyle ayrılıyor (başka satır kaybı yok); `SET` satırı ya da sed
ifadesi silinince (mutasyon) yeni kontroller exit 1 veriyor; emniyet plpgsql
gövdesini koruyor. **Gerçek PostgreSQL'e karşı DEĞİL** — `pg_get_expr`
davranışı stub'da taklit edildi; asıl kanıt 2. tur. ✅ 2. turda gerçek
PostgreSQL 17.6'da kanıtlandı: 0 hata, 4 storage policy.

### ✅ 2. tur — yapıldı (10 Eylül 2026)

Sonuçlar yukarıda, ⏰ ELLE madde 3.

## 🧪 TATBİKAT 3 / BUG 3 — baseline rol bazlı REVOKE'u taşımıyordu (11 Eylül 2026)

**Durum:** ✅ **KAPATILDI (11 Eylül 2026).** Script düzeltildi ve gerçek
PostgreSQL'de sınandı (`6ab8730`); ✅ baseline VPS'te yeniden üretildi (26 ×
OK, `233c1af` — ⏰ ELLE madde 4); ✅ geri yükleme tatbikatında yeni
baseline'la KURULUM Adım 11 sorgu 4 → **`f`** (10 sorgunun 10'u kayıtlı).
Geçici kurtarma satırına artık gerek yok.

### Bulgu

Geri yükleme tatbikatı, adım 2: boş Supabase projesine `000_baseline.sql`
yüklendi, KURULUM Adım 11 sorgu 4:
`has_function_privilege('anon', 'public.is_super_admin(uuid)', 'EXECUTE')` →
**`t`** (canlıda `f`). Yeni projedeki `proacl`:
`{postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}`
— `anon`'a **role özel** grant. Baseline'daki tek REVOKE:
`REVOKE ALL ON FUNCTION public.is_super_admin(user_id uuid) FROM PUBLIC;`

### Ölçüm — canlı (11 Eylül)

| fonksiyon | anon | authenticated | service_role | proacl |
|---|---|---|---|---|
| `is_super_admin(uuid)` | **f** | t | t | `{postgres=X, authenticated=X, service_role=X}` — **anon YOK, PUBLIC (`=X`) YOK** |
| `prevent_default_tenant_deactivation()` | t | t | t | `=X` (PUBLIC) + anon + authenticated + service_role |
| `set_updated_at_timestamp()` | t | t | t | aynı |
| `user_has_tenant_access(uuid)` | t | t | t | aynı |

Tablo kapsamı (A3 — Supabase varsayılanının vereceği ama canlıda olmayan
tablo yetkisi): **0 satır**. Sorun yalnızca `is_super_admin`'de: Supabase
varsayılanından bilerek saptığımız tek nesne. `022` canlıda **tam** çalışmış.

### Kök neden — pg_dump ACL'yi FARK olarak yazar

pg_dump bir nesnenin ACL'sini olduğu gibi dökmez; PostgreSQL'in **sabit**
varsayılanına (`acldefault`; fonksiyon için sahip + PUBLIC) göre fark yazar —
kaynağın `pg_default_acl`'ine göre **değil**. Canlı ↔ `acldefault` farkı:
PUBLIC var→yok (`REVOKE ... FROM PUBLIC`), authenticated ve service_role
yok→var (`GRANT`). `anon` **iki tarafta da yok** → yazılacak bir şey yok. Bir
rolün yokluğu pg_dump'ın dilinde ifade edilemiyor.

Hedefte ise `CREATE FUNCTION` Supabase'in ADP'si altında çalışır ve yeni
fonksiyon `{=X, postgres=X, anon=X, authenticated=X, service_role=X}` ile
doğar (canlıdaki diğer üç fonksiyonun ACL'si tam olarak bu). `REVOKE ...
FROM PUBLIC` PUBLIC girdisini **kaldırır** (etkili — yoksa anon PUBLIC
üzerinden de çağırırdı), ama ACL girdileri grantee bazlıdır: `anon=X`'e
dokunmaz. 022'nin kendi yorumu tersini söylüyordu ("yalnız `FROM anon`
yetmez") — simetriği ("yalnız `FROM PUBLIC` de yetmez") bizi ısırdı.

**BUG 2'nin (ADP satırlarını silmek) etkisi YOK:** silinen satırlar hedefte
zaten var olan varsayılanın kopyasıydı; bıraksak aynı grant'ları yazardı.

**Şiddet:** yetki yükseltmesi **değil** — yetki kaynağı hâlâ `super_admins`
tablosu; süper admin policy'lerinin hepsi `TO authenticated` ve
`is_super_admin(auth.uid())` çağırıyor (anon'da `auth.uid()` NULL → false).
Etki: giriş yapmamış biri, bildiği bir kullanıcı UUID'si için "süper admin
mi?" diye sorabiliyor (oracle / bilgi sızıntısı) ve 022'nin kurduğu savunma
hattı yeni kurulumda yok doğuyor. Asıl sorun sınıfsal: **canlıdan daha
kısıtlı hiçbir yetki baseline'a geçmiyordu.**

### Neden kaçtı

1. **Script'in kontrolü yanlış şeyi kanıtlıyordu.** "022 REVOKE korunmuş (ACL
   dahil)" yalnızca `REVOKE ALL ON FUNCTION public.is_super_admin` arıyordu
   → `FROM PUBLIC` satırına uydu; 022'nin iki REVOKE'undan biri kanıtlandı.
   Script yorumu ve bu NOTE'taki `--no-acl` paragrafı "ACL dahilse 022 gelir"
   diye yanlış varsayımı yazıya geçirmişti (ikisi de düzeltildi).
2. **2. tur kaydında Adım 11 sorgu 4 yok** — kayıt 1, 5, 6, 8 ve 10'u
   listeliyordu; 2, 3, 4, 7, 9 kaydedilmemişti (koşulup koşulmadığı
   bilinmiyor). Açığı yakalayan tam olarak 4; geri yükleme tatbikatında
   koşuldu ve yakaladı.

### Çözüm — script'te (BUG 1 ve 2 ile aynı yer)

Bu bir şema değişikliği değil, **üretici hatası**: canlı zaten doğru,
baseline canlıyı yeniden üretemiyor. BUG 1/2 gibi script'te düzeltildi;
baseline elle düzenlenmedi.

- **Bölüm D (yeni):** canlıda `anon`/`authenticated`/`service_role`'ün
  EXECUTE'u **olmayan** her public fonksiyon için açık
  `REVOKE ALL ON FUNCTION|PROCEDURE ... FROM <rol>;`. Liste canlıdan
  (`has_function_privilege` — etkin yetki, PUBLIC dahil) üretilir; isim
  listesi yok, ileride kısıtlanan fonksiyonlar kendiliğinden kapsanır.
  Sorgudan önce `SET search_path = ''` — `regprocedure` da `pg_get_expr` gibi
  şemayı yalnız görünmüyorsa yazar (BUG 1 tuzağı). Bugünkü çıktı tek satır:
  `REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM anon;`
- **Tablo dedektörü:** aynı sınıf tablo/görünüm/sequence için (MAINTAIN
  yalnız PG17+). Canlıda Supabase varsayılanından kısıtlı bir yetki bulursa
  script **dosya üretmeden durur** ve nesne/rol/yetkiyi yazar. REVOKE
  **üretmez**, çünkü tabloda `REVOKE <yetki> ON TABLE` o yetkinin kolon
  grant'larını da siler: Bölüm B'den sonra çalışan otomatik bir REVOKE,
  canlıdaki kolon bazlı grant'ları sessizce yok ederdi. O gün Bölüm D bilinçli
  genişletilir.
- **Kontroller 23 → 26** (ve 10. kontrolün etiketi düzeltildi: artık yalnız
  "022'nin FROM PUBLIC yarısı var (tek başına YETMEZ)" diyor, satır
  başına/sonuna sabitli):
  - **24** — **canlıya sorar:** `anon` `is_super_admin`'i çağıramıyor.
    Sabit değişmez: Bölüm D ve 26 canlıyı **aynalar**; canlıda biri
    `anon`'a grant verirse baseline bunu sadakatle kopyalar ve veri güdümlü
    her kontrol yine geçer. 24 o körlüğü kapatır.
  - **25** — dosyada Bölüm D'de satır birebir:
    `REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM anon;`
  - **26** — Bölüm D == canlıdaki kısıtların **bağımsız** türetimi (ham
    `proacl` → `aclexplode`; PUBLIC = grantee 0). Bölüm D boş kalırsa,
    birleştirmeden düşerse ya da sorgusu bozulursa yakalar.
- **Runtime kanıtı KURULUM Adım 11 sorgu 4'te kalıyor** (statik kontrol
  dosyanın satırı içerdiğini, yalnız o sorgu hedefin o duruma geldiğini
  kanıtlar). Adım 11'e: "10 sorgunun 10'u kaydedilir, biri bile farklıysa
  kurulum tamamlanmadı" + sorgu 4 için tek satırlık kurtarma.

**Neden `027` migration'ı DEĞİL:** canlıda hiçbir şey yapmaz (anon girdisi
zaten yok); KURULUM Adım 3 iki dosya çalıştırıyor, üçüncüsü unutulacak adım
olur; ve asıl sebep: baseline yeniden üretilince 027 `archive/`'a gider,
yeni dump yine `FROM anon` içermez → **açık geri gelir.** Kendi çözümünü
imha eden düzeltme. Tohum (`001`) da değil: veri dosyası, canlıda koşmaz.

### Test — gerçek PostgreSQL 18.3 (yerel, geçici küme)

"Canlı" = repodaki baseline + 022'nin etkisi, Supabase ADP'li boş bir DB'de
(roller, `auth`/`storage`/`extensions` iskeleti, ADP: 3 nesne türü × 4 rol).
Windows `psql.exe` CRLF yazdığı için script'i Linux'taki gibi koşturan ince
bir `\r` silici katman kullanıldı (yalnız satır sonu; VPS'te gereksiz).

| senaryo | sonuç |
|---|---|
| "canlı" matrisi | canlı ölçümüyle **birebir** (yukarıdaki tablo, A3 = 0) |
| repodaki baseline → boş DB | `is_super_admin` anon = **t**, `proacl` tatbikattakiyle aynı — **bulgu yeniden üretildi** |
| eski script → boş DB | exit 0, **23/23 OK** ("022 REVOKE korunmuş" dahil), anon = **t** — eski hat açığı kontrollerden geçiriyordu |
| yeni script → boş DB | exit 0, **26/26 OK**, Bölüm D = 1 satır; anon = **f**, `proacl` canlıyla birebir, 4 fonksiyonun etkin yetkileri canlıyla **aynı** |
| eski ↔ yeni çıktı farkı | yalnız başlıktaki İÇERİK satırı + Bölüm D (başka satır kaybı yok) |
| dedektör: canlıda `REVOKE INSERT ON news FROM anon` | exit 1, `public.news rol=anon yetki=INSERT`, dosya **oluşmadı** |
| canlı gerilemesi: canlıda `GRANT ... TO anon` | exit 1 — 24 (`donen: t`) ve 25 düştü; 26 geçti (canlıyı aynalıyor — 24'ün varlık sebebi) |
| mutasyon: Bölüm D'nin `SET search_path` satırı silinir | 25 + 26 düştü (`is_super_admin(uuid)` şemasız); o dosya yüklenince `function is_super_admin(uuid) does not exist` |
| mutasyon: birleştirmedeki `cat revoke.sql` silinir | 25 + 26 düştü |
| mutasyon: Bölüm D rol filtresi bozulur (boş liste) | 25 + 26 düştü |
| genellik: yalnız-servis fonksiyonu + PUBLIC'li fonksiyon + procedure | 26/26 OK, Bölüm D 4 satır (`... FROM anon`, `... FROM authenticated`, `ON PROCEDURE ...`); PUBLIC'li fonksiyon için satır **yok** (anon PUBLIC üzerinden çağırabiliyor — doğru); yüklenen DB'nin etkin yetkileri canlıyla **aynı** |

Repo doğrulaması: tsc + lint + build + 11 test script'i (`test:backup-db`
WSL'de 58/58) geçti.

**Gerçek Supabase kanıtı — ✅ (11 Eylül 2026):** VPS'te 26 × OK (⏰ ELLE
madde 4) + yeni baseline'la boş projede (`sendika-tatbikat2`) Adım 11 sorgu 4
→ `f`, 10 sorgunun 10'u kayıtlı.

### Süreç kuralı (bu bug'dan)

**Tatbikat kaydı KURULUM Adım 11'in 10 sorgusunun 10'unun sonucunu tek tek
yazar.** "Temiz geçti" yalnız o zaman yazılır. 2. tur bu kural olmadığı için
bir güvenlik açığını "KANITLANMIŞ" etiketiyle geçirdi.

## ✅ KAPATILDI (10 Eylül 2026) — `001_seed_default.sql` içindeki `BEGIN;` / `COMMIT;`

Seed kendi transaction'ını açıyordu (`BEGIN;` satır 58, `COMMIT;` satır 113);
KURULUM.md ise onu `psql --single-transaction` ile çalıştırtıyor. İkisi
çakışıyor: psql'in açtığı transaction içinde dosyanın `BEGIN`'i "there is
already a transaction in progress" uyarısı veriyor, dosyanın `COMMIT`'i dış
transaction'ı erken kapatıyor (sondaki psql `COMMIT`'i için "there is no
transaction in progress" uyarısı da beklenir). 2. turda **zararsızdı, veriler
yazıldı** — `COMMIT`'ten sonra dosyada yalnızca yorum var.

Gizli risk: `COMMIT`'ten sonra bir gün çalıştırılabilir bir satır eklenirse o
satır transaction **dışında** çalışır; `--single-transaction`'ın "ya hep ya
hiç" garantisi sessizce bozulur.

**Yapıldı:** seed'den `BEGIN;` / `COMMIT;` çıkarıldı. Atomikliği
`--single-transaction` sağlıyor; dosya zaten idempotent (`ON CONFLICT DO
NOTHING` / `NOT EXISTS`) — yarım kalmış bir koşum tekrar çalıştırılarak
tamamlanır. Karar dosya başındaki "TRANSACTION" yorumunda yazılı ("geri
eklemeyin"). Doğrulama: bir sonraki kurulumda seed **uyarısız** geçmeli
(henüz koşulmadı).

---

# ✅ KAPATILDI — Davet kabulünde yanlış kurum (`.limit(1)`) (10 Eylül 2026)

**Durum:** Kod tarafı **düzeltildi** — tsc + lint + build + 5 test script'i
(291 test) geçti. SQL adımı **YOK**. ✅ Canlı test (10 Eylül): her davet
linki kendi kurumuna götürüyor (aşağıda "Davranış — ölçüldü"). ✅ Aynı gün
çıkan yan bulgu (geçersiz linkte mevcut oturuma düşme) da kapatıldı. Kalan
elle iş: Dashboard'da lokal Redirect URLs deseni + manuel test 1, 2 (tekrar),
3, 5, 6, 7 (aşağıda ⏰).

## Bug neydi?

`davet-kabul`, şifre belirlendikten sonra kişiyi `tenant_users … .limit(1)`
ile **sıralamasız** seçtiği kuruma yolluyordu. Birden fazla kuruma üye (ya da
arka arkaya iki kuruma davet edilen) kişi, davet edildiği kurum yerine
rastgele birine düşebiliyordu. Davet linki kurum bilgisini **taşımıyordu**:
`buildInviteRedirectUrl(slug)` slug'ı alıp production'da kullanmıyordu.
Zarar: veri sızıntısı yok (kişi düştüğü kurumun da meşru üyesi); yanlış
kurumda iş yapma / kafa karışıklığı. (Kaynak kayıt: "🔴 CANLI BUG — Admin
eklerken davet maili..." → BACKLOG madde 1.)

## Çözüm — davet linki kurumu taşıyor: `/admin/davet-kabul?tenant=<uuid>`

- **`lib/super-admin/admin-invite.ts`** → `buildInviteRedirectUrl({ id, slug })`
  linke `?tenant=<uuid>` ekliyor. Yeni saf fonksiyonlar: `parseInviteTenantId`
  (yalnızca geçerli UUID) ve `chooseInviteTenant` (kurum seçimi). İki route
  (`create-tenant`, `tenant-users`) yeni imzayla çağırıyor.
- **`admin/davet-kabul/page.tsx`** → parametre, `replaceState` URL'i
  temizlemeden **önce** okunuyor ve `sessionStorage`'da tutuluyor (şifre
  formunda sayfa yenilenirse kaybolmasın). Taze bir davet linki parametresizse
  depodaki eski değer siliniyor (aynı sekmede önceki davetten kalan kurum
  karışmasın). Şifre sonrası **tek sorgu**: kişinin kendi üyelikleri
  (`created_at DESC`) → `chooseInviteTenant`.
- **`scripts/test-tenant-user-add.mjs`** → 47 → 71 test: link kurumu taşıyor
  ve Supabase `#token` ekledikten sonra da okunuyor; link `…/davet-kabul*`
  desenine uyuyor; UUID doğrulaması; seçim kuralının tüm dalları.

**Seçim kuralı (`chooseInviteTenant`):**
1. Linkteki kurum geçerli **ve kişi ona üye** → o kurum.
2. Değilse → **en son eklenen üyelik** (`created_at` en büyük). Yeni gelen
   davet çoğu zaman en son eklenen üyeliktir. **Kurum seçici ekranı YOK**
   (bilinçli: gereksiz sürtünme). Bu dala düşülürse konsola uyarı yazılır
   (`not_a_member`, ya da çoklu üyelikte `no_param`). Tarih okunamazsa
   sorgunun `created_at DESC` sırası geçerli kalır.
3. Hiç üyelik yok → `/admin/yetkisiz` (eski davranış).

**Neden böyle** (teşhis — Supabase Auth kaynağından okundu):
- **UUID, slug değil:** slug `update-tenant` ile değişebiliyor.
- **Query parametresi, `user_metadata` değil:** Supabase, onaylanmamış mevcut
  kullanıcıya yapılan yeniden davette `data`'yı **yok sayıyor** → "A'ya davet,
  kabul etmeden B'ye ekle" senaryosunda metadata A'da kalırdı (tam da
  düzeltilen durum). Üstelik metadata kişi başına **tek** alan; elinde aynı
  anda birden fazla davet linki olan kişiyi temsil edemez — query parametresi
  ise her linkte ayrı (aşağıda "Davranış — ölçüldü"). Yan bulgu: davet mailine
  `data` ile `tenant_name` konursa, yeniden davet mailinde **ilk kurumun adı**
  görünür.
- **Parametre korunuyor mu:** auth-js adresi kodlayarak yollar → Supabase
  doğrular, mail linkine kaçışlayarak gömer → `/verify` sonrası token'ları
  `adres + "#" + ...` diye **sona ekler**. Query olduğu gibi kalır.
- **Güvenlik:** parametre ipucu, yetki değil — yalnızca kişinin **kendi**
  üyelikleri içinde aranır (sorgu `user_id` filtreli + RLS).

## Davranış — ölçüldü (10 Eylül 2026, canlı)

> ⚠️ **Düzeltme:** bu bölümün ilk halinde "yeniden davet eski token'ı
> geçersiz kılar, yalnızca son link çalışır" yazıyordu. Ölçümde **eski link de
> açıldı** — o varsayım kaldırıldı.

**Kural: her davet linki kendi kurumunu taşır; GEÇERLİ bir link kişiyi o
kuruma götürür (kişi üyeyse). Elde aynı anda birden fazla davet linki
olabilir.** Hesap bu linklerden biriyle onaylanınca Supabase kalan davet
token'larını temizler (Auth kaynağı: `User.Confirm`; canlıda test 2 tekrarıyla
doğrulanacak) — diğer linkler artık **"Davet Linki Geçersiz"** ekranına düşer
ve kişiyi **o linkin kurumunun** giriş / şifremi unuttum sayfasına
yönlendirir. Eski bug'da hangi linke tıklanırsa tıklansın rastgele/ilk kuruma
düşülüyordu.

Ölçüm (**yan bulgu düzeltilmeden ÖNCE**): aynı adres önce Kurmay'a eklendi
(davet kabul edilmedi), 60 sn sonra default tenant'a; iki mail geldi.

| Sıra | Link | Sonuç |
|---|---|---|
| 1 | İkinci (son) mail — default | Şifre belirlendi → **default** paneli ✅ |
| 2 | Birinci mail — Kurmay (sonra, aynı tarayıcıda) | "Davet Linki Geçersiz" **demedi** → şifre formu → şifre değişti → **Kurmay Teknoloji** paneli. Sebep aşağıdaki yan bulguydu; düzeltmeden sonra bu link "Geçersiz" ekranını gösterir |

2. satır aynı zamanda parametrenin canlıda Supabase'den geçip sayfaya
ulaştığının kanıtıdır: yedek kural en son eklenen üyeliği (default) seçerdi,
kişi Kurmay'a gitti.

**Neden zarar yok:** kişi iki kurumun da meşru üyesi (`tenant_users`
satırlarını süper admin ekledi) — ikisine de erişmesi normal. `?tenant=` yetki
değil ipucu: yalnızca kişinin **kendi** üyelikleri içinde aranır; üye olmadığı
bir kurumu gösterirse en son üyeliğe düşülür, hiçbir kuruma erişim açmaz.
Şifre değişikliği de yalnızca oturumdaki kişinin kendi şifresini değiştirir.

**Birinci link neden açıldı — "iki token da geçerli" olduğu için DEĞİL.**
Tarayıcı tarafı yerel kodla doğrulandı: auth-js 2.101.1 URL'deki hatada
mevcut oturumu **bilerek silmiyor** (`GoTrueClient._initialize`: "Don't
remove existing session on URL login failure"). Supabase Auth kaynağına
(master) göre de:
- Kullanıcı onaylanınca (`User.Confirm()`) davet token'ı temizlenir
  (`ConfirmationToken = ""` + `ClearAllOneTimeTokensForUser`). İkinci link
  kullanıcıyı onayladığı için birinci linkin token'ı o anda geçersizleşmiş
  olmalı.
- Geçersiz linkte Supabase `redirect_to`'ya **query'yi koruyarak** döner,
  hatayı hash'e yazar: `…/davet-kabul?tenant=<kurmay>#error=access_denied&error_code=otp_expired…`.
- Kabul sayfası hash'teki `error`'u **okumuyordu**; hash'te token yoksa
  tarayıcıdaki mevcut oturuma düşüyordu. İkinci linkin açtığı oturum aynı
  tarayıcıda duruyordu → form göründü, aynı kişi kendi şifresini değiştirdi,
  `?tenant=` Kurmay olduğu için Kurmay'a gitti.

Kalan tek canlı doğrulama: **test 2'nin tekrarı**. İlk link artık "Davet
Linki Geçersiz" + "Hata kodu: otp_expired" gösterirse açıklama kesinleşir.
Yine şifre formu açılırsa token gerçekten geçerliydi demektir (adres çubuğunda
`#access_token` görünür) — o durumda kişi Kurmay'a gider; bu da doğru
davranış. "Yeniden davet eski linki henüz kullanılmadan iptal eder mi" sorusu
ise ancak eski linke **önce** ve **oturumsuz** bir tarayıcıda tıklanarak
ölçülür. Sonuç ne çıkarsa çıksın yukarıdaki kural ve "zarar yok"
değerlendirmesi değişmez.

**✅ KAPATILDI (10 Eylül 2026) — yan bulgu: geçersiz linkte mevcut oturuma
düşme.** Eskiden `davet-kabul` hash'teki `#error=`'u görmezden gelip mevcut
oturumla devam ediyordu: geçersiz ya da süresi dolmuş bir davet linkine
tıklayan ve tarayıcısında oturumu açık olan herkes "Şifrenizi Belirleyin"
formunu görüyor, **oturumdaki kişinin** şifresi değişiyordu. Yetki
yükseltmiyordu (kendi şifresi, kendi üyelikleri) ama ortak bilgisayarda
yanıltıcıydı.

- **`admin-invite.ts` → `parseAuthLinkError(hash, search)`** (saf): Supabase
  hatası var mı, kodu ne, hangi akıştan. Supabase hatayı **her zaman hash'e**
  yazar; PKCE akışında **query'ye de** yazar (Auth kaynağı:
  `prepErrorRedirectURL`). Bu uygulamada PKCE = şifre sıfırlama, implicit =
  davet → ekran başlığı buna göre ("Sıfırlama Linki Geçersiz" / "Davet Linki
  Geçersiz").
- **`davet-kabul/page.tsx`**: hata kontrolü `getSession()`'dan, kurum ve
  kurtarma bayraklarından **önce**. Hata varsa mevcut "Geçersiz" ekranı
  gösterilir, oturuma **dokunulmaz** (ne kullanılır ne kapatılır), bayraklar
  temizlenir. Ekran yeniden yazılmadı, genişletildi: neden cümlesi + yön +
  küçük puntoyla "Hata kodu: …" (destek için).
- **Mesaj kararı — `describeAuthLinkError`:** `otp_expired` → "Bu bağlantının
  süresi dolmuş ya da bağlantı daha önce kullanılmış." Yalnız "süresi dolmuş"
  **denmiyor**: Supabase bu kodu hem süresi dolmuş hem **bulunamayan** token
  için döndürüyor (tek mesaj: "Email link is invalid or has expired") ve bu
  uygulamada en sık durum ikincisi (birden fazla davet maili). Diğer kodlar →
  "Bu bağlantı doğrulanamadı."
- **Yön (davet):** "Şifrenizi daha önce belirlediyseniz giriş yapabilirsiniz.
  Belirlemediyseniz ya da hatırlamıyorsanız “Şifremi Unuttum” ile yeni bir
  bağlantı isteyin." + iki buton. Butonlar linkteki `?tenant=`'dan kurumun
  **kendi adresine** (subdomain / custom domain) gider: bu sayfa apex'te
  açılır ve apex'te giriş yapan kurum admini "Yetkisiz Erişim"e düşerdi (apex
  = default kurum). `tenants` anon'a açık (`tenants_public_select`). Kurum
  adresi okunurken (birkaç yüz ms) butonlar **tıklanamaz**: href'siz, soluk,
  imleç "bekle" (`PendingLink`). Göreli bağlantılara **yalnızca** sorgu
  başarısız olursa düşülür (hata / satır yok / 5 sn yanıt yok; geç gelen yanıt
  doğru adresi yine yazar). Önceden bu pencerede butonlar apex'i gösteriyordu —
  hızlı tıklayan kurum admini "Yetkisiz Erişim"e düşerdi. `?tenant=` yoksa
  sorgu yapılmaz, göreli bağlantılar hemen gelir. (Custom domain'de "Şifremi
  Unuttum" aşağıdaki BACKLOG'a takılabilir.)
- **Yön (sıfırlama):** değişmedi — "Yeni bir sıfırlama talebi gönderin." +
  "Yeniden Dene" (aynı host'taki sıfırlama sayfası).
- **Test:** `test-tenant-user-add.mjs` (i) grubu, 71 → 87: kullanılmış davet
  linkinin gerçek adres biçimi, PKCE ayrımı, başarılı linklerin hata
  sayılmaması, kodsuz/boş hata, mesaj kararı.

## Redirect URLs deseni — ne zaman `*` gerekir

Supabase bir dönüş adresini (1) **Site URL ile aynı host**'taysa desene hiç
bakmadan kabul eder; (2) değilse adres bir desenle **baştan sona**
eşleşmelidir (desenler `.` ve `/` ayırıcılı glob, `*` bu ikisini geçemez).
Eşleşmezse link **hata vermeden** Site URL köküne düşer.

| Desen (bugünkü hali) | `?tenant=`'lı adresle | Bu akışta |
|---|---|---|
| `https://buyukdirilis.org.tr/admin/davet-kabul` | Desen eşleşmez, **ama** apex = Site URL → kural (1) ile kabul | ✅ Çalışır — değişiklik zorunlu değil |
| `https://*.buyukdirilis.org.tr/admin/davet-kabul` | Eşleşmez | ✅ Etkisiz — production'da subdomain'e query'li adres gitmiyor (davet apex'e döner, şifre sıfırlama query taşımaz) |
| `http://*.lvh.me:3000/admin/davet-kabul` | Eşleşmez | ❌ **Lokal davetler kırılır** — lokal davet `{slug}.lvh.me`'ye döner (farklı host) |

Apex satırı yalnızca build'deki `NEXT_PUBLIC_SITE_URL` Site URL ile birebir
aynıyken (şema + host) güvende. Farklı yazılırsa (ör. `www.` ile) kural (1)
devre dışı kalır ve davetler sessizce kırılır; sona `*` eklemek bu bağımlılığı
kaldırır. Yeni kurulumlar için kural: KURULUM.md Adım 6.

## ⏰ ELLE — Dashboard (canlı proje; lokal de aynı projeye bağlı)

Authentication → URL Configuration → Redirect URLs:

1. **ZORUNLU (lokal):** `http://*.lvh.me:3000/admin/davet-kabul` →
   `http://*.lvh.me:3000/admin/davet-kabul*` (satır yoksa bu haliyle ekleyin)
2. **ÖNERİLİR (production):** `https://buyukdirilis.org.tr/admin/davet-kabul`
   → `https://buyukdirilis.org.tr/admin/davet-kabul*`
3. İsteğe bağlı (bugün etkisi yok, tutarlılık için): wildcard subdomain satırı
   ve `http://lvh.me:3000/admin/davet-kabul` sonuna da `*`.

Deploy sırası serbest: production davetleri 1-2 yapılmadan da çalışır (kural
1). Lokal testler 1'den **sonra**.

## ⏰ ELLE — manuel testler (gizli pencere, `+alias` adresler)

> ⚠️ **Adresin elle girildiği testlerde (5-7) sayfa YENİDEN YÜKLENMELİ.** Aynı
> sekmede yalnızca `#…` kısmını değiştirmek sayfayı yeniden yüklemez: effect
> tekrar çalışmaz, **önceki yüklemenin ekranı kalır** → yanlış negatif. 10
> Eylül'de tam olarak bu yaşandı: butonlar apex'i gösterdi, aynı adres gizli
> pencerede açılınca Kurmay'a gitti — kod doğruydu. Her denemede yeni bir
> gizli pencere açın ya da adresi girdikten sonra **F5**. (`?` kısmı
> değişirse tarayıcı zaten yeniden yükler; sorun yalnızca `#` sonrası
> değiştiğinde.)

| # | Adım | Beklenen |
|---|---|---|
| 1 | Lokal: yeni bir adresi kurum A'ya ekle, maildeki linke tıkla | Adres önce `…/admin/davet-kabul?tenant=<A-uuid>#…`; şifre sonrası **A**'nın paneli |
| 2 | **Bug senaryosu:** yeni bir adresi A'ya ekle (kabul ETME), ~1 dk sonra B'ye ekle → önce **son** maildeki linke, sonra ilkine tıkla | Son link → **B**'nin paneli. Ardından ilk link → **"Davet Linki Geçersiz"** ("süresi dolmuş ya da daha önce kullanılmış", "Hata kodu: otp_expired"); şifre formu **görünmez**; "Şifremi Unuttum" / "Giriş Sayfasına Git" **A**'nın adresine gider. (Yan bulgu düzeltilmeden önceki ölçümde ilk link A'nın panelini açmıştı — bkz. "Davranış — ölçüldü". Şifre formu açılırsa token gerçekten geçerliydi → A'nın paneli; bu da doğru davranış) |
| 3 | 2'de son linkle açılan şifre formundayken sayfayı **yenile**, sonra şifreyi belirle | Yine **B** (sessionStorage) |
| 4 | Production (deploy sonrası): tek bir davet | Kişi doğru kurumun paneline düşüyor. ✅ Fiilen doğrulandı (10 Eylül): 2. testte ilk link Kurmay'a götürdü — yedek kural en son eklenen default'u seçerdi, yani parametre canlıda korunuyor. Maildeki `redirect_to`'da `%3Ftenant%3D…` kontrolü artık isteğe bağlı |
| 5 | **Sahte hata adresi (mail gerekmez):** bir admin olarak giriş yapmışken, aynı tarayıcıda `https://buyukdirilis.org.tr/admin/davet-kabul?tenant=<kurum-uuid>#error=access_denied&error_code=otp_expired&error_description=x` adresini açın (UUID: `SELECT id, slug FROM public.tenants;`) | "Davet Linki Geçersiz" + "Hata kodu: otp_expired"; şifre formu **görünmez**; butonlar kısa bir an soluk ve tıklanamaz, sonra kurumun kendi adresine gider (üzerine gelince `https://<kurum-adresi>/admin/...`); başka sekmedeki panel oturumu **kapanmaz** |
| 6 | **Gerçek geçersiz link:** bir davet linkiyle şifre belirleyin, sonra **aynı** linke tekrar tıklayın (token kullanıldı). Alternatif: maildeki linkte `token=` değerinin bir harfini değiştirin | 5 ile aynı ekran (Supabase kullanılmış / bozuk token'da `otp_expired` döndürür) |
| 7 | **Sıfırlama linki hatası:** `https://buyukdirilis.org.tr/admin/davet-kabul?error=access_denied&error_code=otp_expired&error_description=x#error=access_denied&error_code=otp_expired&error_description=x` | "Sıfırlama Linki Geçersiz" + "Yeniden Dene" (hata query'de de var = PKCE = sıfırlama) |
| 8 | Test hesaplarını Auth'tan ve `tenant_users`'tan silin | — |

Test 1 ve 3 hâlâ geçerli ve bekliyor (1, Dashboard'daki lokal desen
değişikliğinden sonra). Test 2 yan bulgu düzeltmesinden sonra **tekrar**
edilmeli (beklenti değişti). Test 4'ün amacı — teşhisin dayandığı Supabase
davranışının canlıdaki sürümde de geçerli olması — 2. testteki Kurmay
sonucuyla karşılandı. Test 5-7 yeni (geçersiz link ekranı).

---

# ✅ KAPATILDI — Custom domain'li kurumlarda şifre sıfırlama çalışmıyordu (10 → 11 Eylül 2026)

**Durum:** ✅ **KAPATILDI — canlıda ölçüldü ve düzeltildi** (11 Eylül 2026).
Aşağıdaki 10 Eylül çıkarımı birebir doğrulandı.

**Ölçüm (canlı, kurmayteknoloji.com):** şifre sıfırlama linki
`https://buyukdirilis.org.tr/?code=…` adresine düşüyordu — kişi şifre formu
yerine ana sitenin **anasayfasını** görüyordu. Mekanizma tahmin edilenin
aynısı: adres Redirect URLs'te yok → Supabase Site URL köküne düşürüyor; PKCE
doğrulayıcısı custom domain'de kaldığı için kod takası da tamamlanamıyor.

**Çözüm:** Supabase → Authentication → URL Configuration → Redirect URLs'e
Kurmay için **4 satır** eklendi (apex/www varyantları, sonda `*`); test
edildi, **çalışıyor**. 4 satır özel bir gerekçeyle değil "her varyantı ekle"
refleksiyle eklendi — kodun istediği **2 satır**: apex (zorunlu) + www
(savunma). Kural artık bu (KURULUM.md Adım 6.1). `kurmayteknoloji.com.tr`
.com'a 301 yönlendiği ve kendi başına sıfırlama sayfası açmadığı için satır
gerektirmez.

**Kalıcı önlem:** süper admin → kurum sayfası → **Kurulum Durumu** — satırın
varlığını Supabase'e canlı sorar ("Supabase dönüş adresi" maddesi) ve
satırları domain'den üretir. Bkz. "🧭 KURULUM DURUMU".

---

**10 Eylül'deki ilk kayıt (çıkarım aşaması — tarihsel):**

**İlk durum:** ⚠️ ÖLÇÜLMEDİ — kod okuması + bu dosyadaki Dashboard kaydından
çıkarım.

Redirect URLs listesinde yalnızca apex ve `*.buyukdirilis.org.tr` var
("VPS DEPLOY → 5. Supabase Auth URL Configuration"), müşteri domainleri yok.
Şifre sıfırlama linki isteğin yapıldığı adrese döner
(`SifremiUnuttumForm.tsx:20` → `window.location.origin`), örn.
`https://kurmayteknoloji.com/admin/davet-kabul`. Bu adres ne Site URL
host'unda ne de bir desenle eşleşiyor → Supabase adresi **hata vermeden**
Site URL köküne düşürür (`https://buyukdirilis.org.tr/?code=…`). Sıfırlama
PKCE akışıdır: kodu takas edecek doğrulayıcı (code verifier) custom domain'in
tarayıcı deposunda kaldığı için **kod takası tamamlanamaz** — kişi şifre formu
yerine ana sitenin anasayfasını görür.

KURULUM.md Adım 6 custom domain'in listeye eklenmesini zaten söylüyor; canlı
kayıtta eklendiğine dair iz yok.

**Doğrulama:** `https://kurmayteknoloji.com/admin/sifremi-unuttum` üzerinden
bir test sıfırlaması — maildeki linkin `redirect_to` değerine ve düşülen
adrese bakın. Dashboard → Redirect URLs listesine bakmak da ipucu verir.
Etkilenebilecek kurumlar:

```sql
SELECT slug, custom_domain FROM public.tenants
WHERE custom_domain IS NOT NULL ORDER BY slug;
```

**Olası çözüm (ölçümden sonra):** her custom domain'i kurulumda Redirect
URLs'e ekle (`https://<domain>/admin/davet-kabul*`) ve bunu müşteri kurulum
kontrol listesine madde yap. (Sıfırlamayı tek adreste toplamak da mümkün ama
PKCE doğrulayıcısı isteğin başladığı adreste tutulduğu için form da oraya
taşınmalı — daha büyük iş.)

---

# ✅ KAPATILDI — Bağlantısız (yetim) Auth hesapları: liste + elle silme (10 Eylül 2026)

**Durum:** Kod tarafı **tamam** — tsc + lint + build + 6 test script'i geçti.
SQL adımı **YOK**. **Önleyici:** canlıda bağlantısız hesap yok (ölçüm
aşağıda). Elle iş: manuel testler (aşağıda ⏰).

## Sorun

Admin kaldırılırken (`tenant-users` DELETE) ya da kurum silinirken
(`delete-tenant`) `cleanupOrphanUserIfNeeded` `"error"` dönerse üyelik gider,
Auth hesabı kalır → 207. Eskiden 207 **4 sn'lik yeşil** `toast.success` idi:
kimin kaldığı yazmıyordu (`failedUsers` yalnız ID taşıyor ve gösterilmiyordu),
kişi listeden düşüyordu — hesap bir daha panelde görünmüyordu. (Kaynak kayıt:
"🔴 CANLI BUG — Admin eklerken davet maili..." → BACKLOG madde 2.)

**Sıra bilinçli korunuyor:** hesap silinemese de üyelik kaldırılır. Erişimi
kaldırmak hesabı silmekten önemli; bağlantısız hesabın hiçbir kuruma erişimi
yok, üyeliği bırakmak ise çıkarılması gereken admini kurumda tutardı.

## Ölçüm (10 Eylül 2026, canlı)

- Bağlantısız hesap: **0**.
- `auth.users`'a bağlanan **10 FK'nin hepsi `ON DELETE CASCADE`** →
  `deleteUser`'ı kalıcı engelleyen sebep yok; `"error"` dalı yalnız **geçici**
  hatada (ağ / zaman aşımı) tetiklenir.

```sql
-- Bağlantısız hesaplar (panelin gösterdiği küme)
SELECT u.id, u.email, u.created_at, u.last_sign_in_at FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.tenant_users tu WHERE tu.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = u.id);

-- deleteUser'ı kalıcı engelleyebilecek FK'ler — hepsi CASCADE / SET NULL olmalı
SELECT c.conrelid::regclass AS tablo, c.conname, pg_get_constraintdef(c.oid) AS tanim
FROM pg_constraint c
WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass ORDER BY 1;
```

## Çözüm

- **Panel → "Bağlantısız Hesaplar"** (`/super-admin/baglantisiz-hesaplar`,
  sidebar'da): hiçbir kuruluşa bağlı olmayan ve süper admin olmayan hesaplar.
  E-posta araması, "Hiç giriş yapmamış / Giriş yapmış" filtresi, onaylı
  "Hesabı Sil", yükleme hatası için `ListLoadError`, anlamlı boş durum.
- **Uç nokta `api/super-admin/orphan-users`:**
  - `GET` → liste. Fail-closed: veri eksikse 500, yarım liste yok.
  - `DELETE ?userId=` → `cleanupOrphanUserIfNeeded`; silme **anında** üyelik +
    süper admin kontrolü yeniden yapılır. Kişi bu arada bir kuruluşa
    eklendiyse **409, silinmez**; süper admin 409; hesap yoksa 404; geçici hata
    500 (tekrar denenebilir).
- **Liste doğruluğu** (`lib/super-admin/orphan-users.ts`): önce Auth
  kullanıcıları, **sonra** üyelikler (iki okuma arasında davetle eklenen biri
  yanlışlıkla "bağlantısız" görünmesin). `tenant_users` / `super_admins`
  birincil anahtarla sıralı `range` sayfalamayla okunur — PostgREST "Max rows"
  yanıtı sessizce keserse kurumlu biri bağlantısız görünürdü (`listUsers`
  ilk-sayfa bug'ının eşi).
- **207 bildirimi:** ⚠️ uyarı, 12 sn — temizlenemeyen hesabın **e-postası** +
  "Bağlantısız Hesaplar" sayfasına bağlantı. Yeşil başarı (kalan işi
  saklıyordu) ya da kırmızı hata (asıl iş başarısız değil) değil; ℹ️ bilgi
  toast'ı deseniyle aynı. `delete-tenant` `failedUsers`'a e-posta ekliyor
  (alınamazsa ID ile devam, uyarı yine çıkar).
- **Neden otomatik temizlik değil:** hesap silmek geri alınamaz; KURULUM Adım
  5'te süper admin hesabı Auth'ta açılıp `super_admins`'e eklenene kadar geçen
  sürede de bağlantısız görünür.
- **Test:** `npm run test:orphan` (44 test) — seçim, sayfalama (Max rows
  kesse de), okuma sırası, fail-closed, silme anındaki yeniden kontrol, uyarı
  metni, panel yolu tutarlılığı.

**Listenin yakaladığı üçüncü kaynak (bu turda düzeltilmedi):** davet hesabı
oluşturur, ardından `tenant_users` eklemesi 23505 dışı bir hatayla düşerse
hesap üyeliksiz kalır (`tenant-users` POST, `create-tenant`). Nadir; artık
panelde görünür.

## ⏰ ELLE — manuel testler (sırayla, `+alias` test adresiyle)

| # | Adım | Beklenen |
|---|---|---|
| 1 | **Üret:** `+alias` adresi bir test tenant'ına admin olarak ekleyin, sonra SQL ile yalnız üyeliğini silin: `DELETE FROM public.tenant_users WHERE user_id = (SELECT id FROM auth.users WHERE email = '<alias>');` → panel → Bağlantısız Hesaplar | Hesap listede, "Hiç giriş yapmadı"; arama ve filtre çalışıyor |
| 2 | **Silme anı kontrolü:** liste açıkken kişiyi panelden tekrar bir tenant'a ekleyin, sonra (tazelemeden) listede "Sil" | "Bu hesap bu arada bir kuruluşa bağlanmış; silinmedi." — liste tazelenir, hesap düşer, **silinmez** |
| 3 | **Listeden silme:** 1'deki SQL'i tekrarlayın → listede "Sil" | "Hesap silindi."; `SELECT count(*) FROM auth.users WHERE email = '<alias>'` → 0 |
| 4 | **207 uyarısı (kontrollü engel):** kişiyi yeniden bir tenant'a ekleyin; hesabı geçici bir FK ile silinemez yapın: `CREATE TABLE public.zz_test_blok (user_id uuid REFERENCES auth.users(id)); INSERT INTO public.zz_test_blok SELECT id FROM auth.users WHERE email = '<alias>';` → panelden kişiyi tenant'tan kaldırın | ⚠️ "Admin kaldırıldı ancak hesabı silinemedi: <alias>. Bağlantısız Hesaplar sayfasından silebilirsiniz." — bağlantı listeye gider, hesap orada |
| 5 | `DROP TABLE public.zz_test_blok;` → listede "Sil" | "Hesap silindi." |
| 6 | (İsteğe bağlı) 4'ü bir **test tenant'ını silerek** tekrarlayın (tablo yine 5'teki gibi kaldırılır) | ⚠️ "Tenant silindi ancak bazı hesaplar silinemedi: <alias>." |

> ⚠️ Test 4-6 canlı veritabanında geçici bir tablo açar (lokal de canlı
> projeye bağlı). Yalnız test hesabıyla yapın ve `DROP TABLE`'ı unutmayın —
> tablo durdukça o hesap silinemez.

---

# ✅ KAPATILDI — `delete-tenant` storage temizliği (Madde B) (10 Eylül 2026)

**Durum:** Kod tarafı **tamam** — tsc + lint + build + 7 test script'i geçti.
SQL adımı **YOK**. **Önleyici:** canlıda silinmiş kuruma ait yetim dosya yok
(ölçüm aşağıda). Elle iş: manuel testler (aşağıda). Yedek cron kontrolü ✅
yapıldı — yanlış alarm, deploy yedeği etkilemiyor.

**Sorun:** `api/super-admin/delete-tenant` kurumu siliyordu (`tenant_id` taşıyan
18 tablonun hepsi `ON DELETE CASCADE` — DB'de yetim kalmıyor) ama storage'a
**hiç** dokunmuyordu: `images/{tenant_id}/…` bucket'ta kalıyordu.

**Ölçüm (10 Eylül 2026):** silinmiş kuruma ait yetim klasör **0**. Bucket:
default 71 dosya / 36 MB, kurmay-teknoloji 5 dosya / 82 kB; prefix'siz eski
dosya kalmamış. Toplam 36 MB / 1 GB.

```sql
-- Klasör (kurum) başına dosya sayısı
SELECT split_part(name, '/', 1) AS klasor, count(*) AS dosya
FROM storage.objects WHERE bucket_id = 'images' GROUP BY 1 ORDER BY 2 DESC;

-- Yetim: kaydı olmayan kurum UUID'si altındaki dosyalar (0 satır beklenir)
SELECT split_part(o.name, '/', 1) AS klasor, count(*) AS dosya
FROM storage.objects o
WHERE o.bucket_id = 'images'
  AND split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id::text = split_part(o.name, '/', 1))
GROUP BY 1;
```

## Uygulanan tasarım

- **Ortak modül `src/lib/super-admin/tenant-storage-purge.mjs`** — route,
  süpürücü script ve test AYNI guard kodunu kullanır (kopyalanan güvenlik kodu
  zamanla ayrışır). **Neden `.mjs`** (proje TS iken): VPS Node 20; `.ts`'yi
  doğrudan çalıştırmak Node 22.6+ ister. Düz JS + JSDoc, `@ts-check` açık; TS
  onu `allowJs` ile tipleriyle okur.
- **`delete-tenant`, yeni 5. adım:** kurum DB'den başarıyla silindikten SONRA
  `purgeTenantStorage` (20 sn bütçe). Önce yapılıp kurum silme patlasaydı
  yayındaki bir kurumun görselleri giderdi (public bucket, versiyon yok).
  Yanıt her durumda `storage` özeti taşır; hesap temizliği ya da storage eksikse
  207.

**Guard'lar** (servis anahtarı storage RLS'ini atlar — koruma koddadır):
1. `tenantId` küçük harfli kanonik UUID olmalı — boş/bozuk değer **hiçbir
   çağrı yapılmadan** reddedilir (`list("")` bucket kökünü, yani tüm kurumları
   listelerdi).
2. Varsayılan kurumun UUID'si (`00000000-…-0001`, tohumla aynı — testte
   kilitli) her koşulda reddedilir.
3. Kurum `tenants`'ta **varsa** hiçbir şeye dokunulmaz: listelemeden önce
   **ve** silmeden hemen önce iki kez sorulur; sorgu hata verirse de
   dokunulmaz (fail-closed).
4. Silinecek her yol segment kontrolünden geçer (`isTenantOwnedPath`): ilk
   segment tam olarak tenantId (düz prefix yanılması yok); `""`, `.`, `..` ya
   da `/` içeren ad ne gezilir ne silinir — atlanır, raporlanır.
5. Silme yalnız `storage.from("images").remove(...)` ile; `storage.objects`'ten
   SQL DELETE yapılmaz (dosyayı depolamada yetim bırakırdı).

**Listeleme:** özyinelemeli + sayfalı (`backup-storage.mjs` dersi) — yalnız
BOŞ sayfada durulur, offset dönen kayıt kadar ilerler ("az geldi = bitti"
varsayımı yok). `.emptyFolderPlaceholder` da silinir (klasör tamamen boşalsın).

**Süre bütçesi — 20 sn (`ROUTE_STORAGE_BUDGET_MS`):** nginx isteği 60 sn'de
keser; kurum silme + hesap temizliği + yanıt için pay bırakılır. Her `list` /
`remove` çağrısından önce kontrol edilir; dolunca durulur (`timedOut`). Bugünkü
hacim (kurum başına ≤ ~71 dosya) sınırın çok altında; 100'lük gruplarla birkaç
bin dosya sığar. Sığmayanlar 207 ile raporlanır, süpürücü temizler.

**Başarısızlıkta:** kurum silinmiş kalır; gruplar bağımsız (bir grup hata
verirse diğerleri yine denenir). 207 uyarısı Madde A deseninde (⚠️, 12 sn):
"Tenant silindi ancak 150 dosya depolamada kaldı (süre sınırı). Kalan dosyalar
temizlik scriptiyle silinebilir." Listeleme bitmediyse "en az N". Hesaplar da
kaldıysa aynı cümlede, "Bağlantısız Hesaplar" bağlantısıyla. Tam başarıda
"Tenant silindi (N dosya)." Silme onay metni artık medya dosyalarının da
silineceğini söylüyor. Geri dönüş: storage yedeği (`_silinenler/`, 30 gün).

## Süpürücü — `scripts/sweep-orphan-storage.mjs`

Geçmiş / kalan yetim klasörler (kaydı olmayan kurum UUID'leri) için. **Tam
checkout'ta** çalışır (`.env.local` ya da `.env` canlıya bağlı, servis anahtarı
gerekli): lokal / WSL ya da VPS'te kaynak dizini `/opt/build/sendika-site`
(Node 20 yeter — modül `.mjs`; oradaki kopya bu turun dosyalarını içerecek
şekilde güncel olmalı). `/var/www/sendika-site`'de **çalışmaz** — orası yalnız
standalone çıktı, `src/` ve `scripts/` yok.

```bash
node scripts/sweep-orphan-storage.mjs                        # RAPOR (varsayılan) — hiçbir şey silmez
npm run sweep:storage                                         # = rapor
node scripts/sweep-orphan-storage.mjs --sil <uuid>[,<uuid>]   # yalnız ADI VERİLEN yetim klasörleri siler
```

- **Rapor:** kök kayıt ve kayıtlı kurum sayısı; her yetim klasör için dosya
  sayısı, boyut, ilk 3 yol; tanınmayan kök öğeler (UUID olmayan klasörler,
  kök dosyaları — **asla silinmez**); kopyalanacak `--sil` komutu.
- **Açık onay:** "hepsini sil" seçeneği bilerek yok. UUID'ler rapordan verilir;
  her biri bu koşumda yeniden doğrulanır (hâlâ yetim mi) — değilse gerekçesiyle
  reddedilir. Silme route'la aynı `purgeTenantStorage` ile (süre bütçesiz).
- **Çıkış kodu:** 0 temiz · 1 silme eksik ya da reddedilen hedef · 2 kullanım hatası.

**Test:** `npm run test:storage-purge` (73 test) — kimlik guard'ları, segment
kontrolü (düz prefix tuzağı, `..`), özyinelemeli + sayfalı listeleme (sunucu az
dönse de), kurum varken / kontrol hatasında / varsayılan kurumda **hiçbir**
list/remove çağrısı yok (silmeden hemen önceki ikinci kontrol dahil),
`.remove()` argümanları (yalnız o kurumun yolları; 100 / 100 / 50), süre
bütçesi, grup hatası, süpürücünün yetim tespiti ve açık onayı.

## ✅ Kontrol edildi — yanlış alarm: deploy yedeği etkilemiyor

İlk raporda "deploy (`rsync --delete` → `/var/www/sendika-site`) yedek
script'ini silmiş, yedek sessizce duruyor olabilir" uyarısı vardı — bu
dosyadaki kurulum komutları `/var/www`'yu gösterdiği için. **Yanlış çıktı.**
VPS'te kontrol edildi:

- Cron **kaynak dizinden** çalışıyor:
  `30 4 * * * cd /opt/build/sendika-site && /usr/bin/node scripts/backup-storage.mjs /var/backups/storage >> /var/log/storage-yedek.log`
- `/opt/build/sendika-site/scripts/backup-storage.mjs` yerinde (9 Eylül).
- `/var/backups/storage/yedek.log` son satırı:
  `2026-09-10T04:30:09 uzak=76 indirilen=0 atlanan=76 hata=0` → yedek çalışıyor.
- `/var/www/sendika-site/scripts/` yok — zaten oradan çalışmıyor.

`rsync --delete` yalnız `/var/www/sendika-site`'yi (standalone çıktı) etkiler;
yedek script'i `/opt/build/sendika-site`'de durduğu için deploy'dan
etkilenmez. Cron kurulurken kaynak dizin bilinçli seçilmişti. Dizin ayrımı
artık "STORAGE YEDEĞİ" ve "VPS DEPLOY → 0. Canlı ortam / 3. Deploy akışı"
bölümlerinde açıkça yazılı.

## ⏰ ELLE — manuel testler

| # | Adım | Beklenen |
|---|---|---|
| 0 | ✅ Yedek kontrolü — yapıldı (yanlış alarm, yukarıda) | Cron `/opt/build/sendika-site`'den çalışıyor; `yedek.log` güncel, hata=0 |
| 1 | Bir test tenant'ı oluşturun, admin panelinden 3-4 görsel yükleyin; yukarıdaki "klasör başına" sorgusu | Test tenant'ının UUID'si N dosyayla listede |
| 2 | Süper admin → test tenant'ını silin | "Tenant silindi (N dosya)."; sorguda o UUID yok, yetim sorgusu 0 satır |
| 3 | Rapor: `node scripts/sweep-orphan-storage.mjs` | "Yetim klasör YOK." |
| 4 | **Yapay yetim:** Dashboard → Storage → `images` → yeni klasör, adı rastgele bir UUID (`SELECT gen_random_uuid();`), içine bir dosya → 3'ü tekrarlayın | Klasör "Yetim klasör" altında (1 dosya), `--sil` komutu önerilir |
| 5 | `node scripts/sweep-orphan-storage.mjs --sil <o-uuid>` | "done — silinen 1/1, kalan 0"; tekrar rapor → "Yetim klasör YOK." |
| 6 | **Guard:** `--sil <kurmay-uuid>` ve `--sil 00000000-0000-0000-0000-000000000001` | İkisi de REDDEDİLDİ (yetim değil / varsayılan kurum), çıkış kodu 1, hiçbir şey silinmez |

207 (süre sınırı, grup hatası) canlıda pratik olarak üretilemez (binlerce dosya
gerekir) — birim testlerinde kilitli.

---

# 💾 STORAGE YEDEĞİ — `scripts/backup-storage.mjs` (9 Eylül 2026)

**Durum:** ✅ **ÇALIŞIYOR** — 9 Eylül 2026'da VPS'te ilk koşum yapıldı ve
cron'a eklendi (her gece **04:30**, **`/opt/build/sendika-site`'den**, artımlı,
silinenler `_silinenler/` altında 30 gün). İlk koşum **124 dosya** indirdi;
artımlılık testi geçti (ikinci koşum: indirilen=0, atlanan=124). Son doğrulama:
`yedek.log` → `2026-09-10T04:30:09 uzak=76 indirilen=0 atlanan=76 hata=0`.
Kalan: geri yükleme tatbikatı (aşağıda).

## Neden ayrı bir script

`/usr/local/bin/supabase-yedek.sh` (her gece 04:00, gzip, 14 gün) **yalnızca
veritabanını** yedekliyor. Storage dosyaları o dökümün içinde **değil**.
Bucket public-read ve **versiyonlama yok** → silinen görsel geri gelmez.

Ölçüm (9 Eylül 2026): `images` bucket'ı **124 dosya / 69 MB**. Bunun 48 dosya
/ 34 MB'ı göç sonrası kalan prefix'siz kopyalar — yedek alındıktan sonra
silinecek. Script bu ayrımı **bilmiyor**, hepsini indiriyor (bilinçli).

## Nasıl çalışıyor

- Ortam dosyası: `.env.local` yoksa `.env` (VPS'te ikincisi). Service-role.
- Listeleme rekursif + sayfalamalı. **Tuzak:** `storage.list()` istenen
  limitten az kayıt dönebilir; döngü "az geldi → bitti" **varsaymıyor**,
  yalnızca boş sayfada duruyor. Aksi halde sunucu tarafı bir limit sessizce
  dosya atlatır — yedekte bu, fark edilmeyen veri kaybıdır.
- Dosya yapısı korunuyor: `{tenant_id}/{klasör}/{dosya}` aynen iniyor.
- İndirme **imzalı URL + stream** ile (bellek dostu; 400 MB'lık video da
  RAM'e alınmaz). Önce `.part`'a yazılıyor, bitince rename → nihai yolda
  hiçbir zaman yarım dosya olmuyor.
- Tek dosya inemezse yedek çökmüyor; sayılıp devam ediliyor. **Hata varsa
  çıkış kodu 1** (cron log'unda görünsün).
- Hedef dizine `yedek.log` satırı yazılıyor (DB yedeği deseni).

## Karar 1 — Artımlı karşılaştırma: uzak `metadata.size` ↔ yerel dosya boyutu

Uzak boyut `list()` cevabından **bedava** geliyor (dosya başına ek istek yok).
Yerelde yalnızca "dosya var mı" bakmak **yetmez**: yarım kalmış bir indirme
diskte kırpık dosya bırakır ve varlık kontrolü onu "yedeklenmiş" sayar.
Boyut kontrolü bunu yakalar; `.part` + rename deseni de boyutu güvenilir bir
imza hâline getiriyor. `metadata.size` yoksa dosya **her zaman** yeniden
iniyor (fail-safe).

**Reddedilen alternatif — eTag/MD5:** içerik değişimini boyuttan iyi yakalar
ama S3 uyumlu depolamada multipart yüklemelerde eTag ham MD5 **değildir**
(`"<md5>-<parça>"`). O durumda yerel MD5 asla eşleşmez ve script her gece
**tüm** dosyaları yeniden indirir — sessizce çalışır ama artımlılık ölür.
Kabul edilen sınır: aynı ad + aynı boyut + farklı içerik atlanır. Bu
uygulamada dosya adları zaman damgalı üretildiği ve aynı yola tekrar
yazılmadığı için bu durum pratikte oluşmuyor.

## Karar 2 — Silinen dosyalar: silme yok, `_silinenler/{tarih}/` + 30 gün

Storage'dan silinmiş ama yerelde duran dosya **silinmiyor**;
`_silinenler/{YYYY-AA-GG}/` altına orijinal yolu korunarak taşınıyor ve
**30 gün** sonra temizleniyor.

- **Birebir ayna (silme) neden değil:** yedeğin varlık sebebi kazara silmeden
  dönmek. Ayna mantığında kazara silinen görsel **ilk gece yedekten de**
  silinir — yedek tam da koruması gereken senaryoda işe yaramaz.
- **Sonsuza kadar tutmak neden değil:** dizin sürekli büyür ve "neyin ne
  zaman silindiği" kaybolur. Tarihli klasör hem sınırlı büyüme hem silinme
  günlüğü sağlıyor.
- **Neden 30 gün (DB 14 iken):** DB'de her gece **tam döküm** alınıyor —
  silinen bir satır 14 ayrı dosyanın içinde duruyor. Storage'da tek canlı
  ayna var; `_silinenler` o kaybın **tek** kaydı. Tek kayıt olduğu ve görsel
  geri getirilemediği için pencere geniş tutuldu. Maliyet ihmal edilebilir.

**İlk kullanım:** 48 prefix'siz dosya silindikten sonraki ilk koşumda
`_silinenler/{tarih}/` altına taşınacak ve 30 gün tutulacak — istenen davranış.

## ⏰ ELLE — VPS'te yapılacaklar (✅ 9 Eylül 2026'da yapıldı)

```bash
# 1) İlk koşum (elle, çıktıyı izleyerek)
cd /opt/build/sendika-site      # KAYNAK dizini — /var/www DEĞİL (aşağıdaki not)
node scripts/backup-storage.mjs /var/backups/storage

# 2) Doğrula: 124 dosya inmiş olmalı
find /var/backups/storage -type f -not -name 'yedek.log' | wc -l
du -sh /var/backups/storage
cat /var/backups/storage/yedek.log

# 3) İkinci koşum — artımlılık testi (hepsi "atlanan" olmalı, indirilen=0)
node scripts/backup-storage.mjs /var/backups/storage

# 4) Cron — DB yedeğinden (04:00) 30 dk sonra, çakışmasın
crontab -e
30 4 * * * cd /opt/build/sendika-site && /usr/bin/node scripts/backup-storage.mjs /var/backups/storage >> /var/log/storage-yedek.log 2>&1
```

**Not:** `node` yolu farklıysa `which node` ile bakıp cron satırında tam yolu
kullanın — cron'un PATH'i kabuktan dardır.

**⚠️ Dizin — karıştırılmasın:** yedek script'i ve cron'u **`/opt/build/sendika-site`**
(sunucudaki kaynak kod) üzerinden çalışır. Script'ler `/var/www/sendika-site`'de
**yoktur** ve olmamalıdır: orası yalnız standalone çıktıdır ve her deploy'daki
`rsync --delete` oraya konan her şeyi siler. Cron kaynak dizinden çalıştığı için
deploy yedeği **etkilemez** (VPS'te doğrulandı — "delete-tenant storage
temizliği" bölümündeki yanlış alarm notu). `scripts/backup-storage.mjs`
değişirse `/opt/build`'deki kopya ayrıca güncellenmeli — deploy onu güncellemez.

## Geri yükleme (henüz TATBİKAT YAPILMADI)

Yedekten dönüş `supabase storage cp` / API ile yeniden yükleme gerektirir;
script tek yönlüdür (yalnızca indirir). **Geri yükleme denenmeden yedek
sayılmaz** — ayrı iş olarak planlanmalı.

> **11 Eylül 2026:** geri yükleme aracı yazıldı —
> `scripts/restore-storage.mjs` (ayna → bucket; mevcut dosyayı ezmez,
> `--silinenler-dahil` ile `_silinenler`'den de döner). DB'deki tam storage
> adresleri için `scripts/rewrite-storage-urls.mjs`. Tatbikat hâlâ yapılmadı —
> bkz. "💾 YEDEKTEN GERİ YÜKLEME".

---

# 🔴 CANLI BUG — Admin eklerken davet maili hiç gönderilmiyordu (8 Eylül 2026)

**Durum:** Kod tarafı **düzeltildi**. SQL adımı **YOK**. Elle iş: aşağıdaki
env kontrolü + 4 manuel test.

## Bug neydi?

Süper admin panelden bir tenant'a admin eklerken, e-posta Supabase Auth'ta
**zaten kayıtlıysa hiçbir mail gitmiyor**, panel yine de "Admin eklendi" /
"Admin'e davet gönderildi" diyordu. Davet edilen kişi hiçbir şey almıyor,
süper admin gönderildiğini sanıyordu.

**Kök neden — yutulan hata değil, hiç yapılmayan çağrı:**

```ts
const existingUser = await findUserByEmail(admin, email);
let userId = existingUser?.id ?? null;
if (!userId) {                    // <-- kullanıcı VARSA blok atlanır
  await admin.auth.admin.inviteUserByEmail(...)   // HİÇ ÇAĞRILMAZ
}
// ... insert ...
toast.success("Admin eklendi.")   // panel sonucu SORMUYOR
```

Aynı desen `create-tenant/route.ts`'te de vardı; `tenants/yeni/page.tsx` ise
API'ye hiç bakmadan sabit **"Admin'e davet gönderildi."** yazıyordu.

## Mail mekanizması — ÖLÇÜLDÜ (9 Eylül 2026), tahmin değil

Kod yazmadan önce canlı Supabase'te (custom SMTP → Resend,
`noreply@buyukdirilis.org.tr`) daha önce hiç kullanılmamış iki `+alias`
adresiyle ölçüldü. **Test hesapları ölçüm sonrası Auth'tan silindi.**

| Auth durumu | `inviteUserByEmail` | Mail |
|---|---|---|
| kayıt yok | başarılı | **GELDİ** |
| kayıtlı, daveti hiç kabul etmemiş | **başarılı** | **GELDİ** (yeniden gönderiyor) |
| kayıtlı, şifresini belirlemiş / giriş yapmış | **422 `email_exists`** | yok |

Ayrıca:

- **`generateLink()` MAİL GÖNDERMEZ.** Taze adrese hiçbir şey ulaşmadı;
  yalnızca link üretiyor. "Davet gönderiliyor" sanılıp kullanılamaz.
- `resetPasswordForEmail` onaylanmamış kullanıcıda bile mail gönderiyor —
  2. dal için alternatifti. Yeniden davet ölçümle çalıştığı için akış tek
  çağrıda tutuldu (kişi "davet" bekliyor, "şifre sıfırlama" değil).
- Daveti asıl reddettiren alan `email_confirmed_at`; bu uygulamada
  `last_sign_in_at` ile birlikte dolar (davet linki `davet-kabul`'de
  `setSession` çağırır). Ayırıcı olarak `last_sign_in_at` seçildi — süper
  admin'e anlatılabilir tek alan bu. Ayırıcı yanılsa bile sonuç sessiz
  kalmaz: davet denenir, hata `invite_failed` olarak raporlanır.

## Kod tarafı (yapıldı)

- **`lib/super-admin/admin-invite.ts`** (yeni) → `decideAdminInviteAction`
  (saf fonksiyon, üç dal), `ADMIN_INVITE_MESSAGES`, `buildInviteRedirectUrl`.
  Tek doğruluk kaynağı; iki route da buradan karar alıyor.
- **`lib/supabase/admin-helpers.ts`** → `findUserByEmail` artık
  `last_sign_in_at` + `invited_at` de döndürüyor (kararın girdisi).
  Yeni `getUserEmailsByIds` — sayfalamalı e-posta eşleme.
- **`api/super-admin/tenant-users` POST** → üç dal + `outcome` alanı:
  `invited` / `reinvited` / `linked_existing` / `invite_failed`.
  Davet, **bağlama başarılı olduktan sonra** gönderiliyor → zaten admin olan
  birine (23505) gereksiz mail gitmiyor.
- **`api/super-admin/create-tenant`** → aynı ayrım; ayrıca `site_settings`
  ve `menu_items` insert sonuçları artık **kontrol ediliyor** (eskiden
  tamamen atılıyordu → ayarsız/menüsüz kuruluş "başarıyla oluşturuldu"
  görünebiliyordu). Eksikler 207 + uyarı olarak dönüyor.
- **`api/super-admin/tenant-users/list`** → parametresiz `listUsers()`
  yalnızca **ilk sayfayı** (varsayılan 50) getiriyordu; 50+ kullanıcıda
  sonraki adminler panelde "(e-posta yok)" görünüyordu. Artık sayfalamalı,
  hata durumunda fail-closed (500).
- **Panel** → `tenants/[id]` ve `tenants/yeni` mesajı artık API'nin
  `outcome`'undan alıyor. `yeni/page.tsx`'teki sabit "Admin'e davet
  gönderildi." **kaldırıldı**; yardım metinleri de gerçeğe çekildi.
- **`buildInviteRedirectUrl`** → `NEXT_PUBLIC_SITE_URL` tanımsızsa eskiden
  `"undefined/admin/davet-kabul"` üretiliyordu. Artık `undefined` dönüyor
  (Supabase proje Site URL'ine düşer) + sunucu log'una açık hata.
- **`scripts/test-tenant-user-add.mjs`** → 47 vaka, `npm run test:tenant-user`.
- **`.env.local.example`** → `NEXT_PUBLIC_SITE_URL` eklendi (prod'da tanımlı,
  dokümanda yoktu).

**Mesajlar (süper admin ne görecek):**

| Durum | Mesaj |
|---|---|
| kayıt yok | "Davet gönderildi." |
| kayıtlı, daveti kabul etmemiş | "…daveti hiç kabul etmemiş. Davet yeniden gönderildi." |
| kayıtlı, giriş yapmış | "Bu kişi sistemde zaten kayıtlı. Mevcut şifresiyle girebilir — davet maili gönderilmedi." |
| davet hata verdi | "…bağlandı fakat davet maili gönderilemedi." (207) |

## ⏰ ELLE — deploy öncesi/sonrası

1. **`NEXT_PUBLIC_SITE_URL` production'da tanımlı mı?** Tanımsızsa davet
   linkleri Supabase proje Site URL'ine düşer. (Lokalde `.env.local`'de yok;
   lokal zaten `{slug}.lvh.me:3000` kullanıyor — sorun değil.)
2. **Supabase → Authentication → URL Configuration → Redirect URLs**
   listesinde `{SITE_URL}/admin/davet-kabul` **tanımlı olmalı**; aksi halde
   Supabase redirect'i kabul etmez.
3. Manuel testler (gizli pencere, gerçek dış adresle):

| # | Adım | Beklenen |
|---|---|---|
| 1 | Hiç kayıtlı olmayan adresle admin ekle | Mail **gelir**; panel "Davet gönderildi." |
| 2 | Daveti kabul etmemiş adresi başka bir tenant'a ekle | Mail **tekrar gelir**; panel "…davet yeniden gönderildi." |
| 3 | Giriş yapmış bir admini başka tenant'a ekle | Mail **gelmez**; panel "…mevcut şifresiyle girebilir — davet maili gönderilmedi." |
| 4 | Zaten o tenant'ın admini olan adresi tekrar ekle | 409 "zaten bu tenant'ın admini"; **mail gitmez** |

**Not:** Test 3 bug'ın kendisi. Test 4 davetin bağlamadan sonra
gönderildiğini doğrular — yalnızca 1–3'ü yapmak yeterli değil.

## 📮 Bilinen — davet mailleri SPAM'e düşüyor

Ölçümde davet mailleri **spam** klasörüne, şifre sıfırlama maili gelen
kutusuna düştü. Gönderen alan adı için SPF/DKIM/DMARC ve Resend alan adı
doğrulaması gözden geçirilmeli. **Ayrı konu — bu turda dokunulmadı.**

## 📋 BACKLOG — bu turda UYGULANMADI

**1. `davet-kabul/page.tsx:199-204` → `.limit(1)` çoklu üyelikte yanlış kurum
— ✅ KAPATILDI (10 Eylül 2026)**

> Davet linki artık kurumu taşıyor (`?tenant=<uuid>`); bkz. "✅ KAPATILDI —
> Davet kabulünde yanlış kurum". Aşağıdaki metin tarihsel kayıttır.

Davet kabul edildikten sonra kişinin gideceği kurum
`tenant_users … .limit(1)` ile seçiliyor — **sıralama yok**. Birden fazla
kuruma üye biri (veya iki kuruma arka arkaya davet edilen biri) daveti kabul
edince **rastgele/ilk bulunan** kuruma düşüyor; davet ettiğiniz kurum
olmayabilir. Davet edilen tenant akışta açıkça taşınmalı (örn. redirect
URL'ine tenant bilgisi eklenip kabulde doğrulanmalı). Codex raporundaki
P2 "Davet akışı ortam ayarlarına bağımlı" maddesiyle aynı kök.

**2. `tenant-users` DELETE 207 → üyeliksiz ama yaşayan Auth kaydı (hayalet hesap)
— ✅ KAPATILDI (10 Eylül 2026)**

> Süper admin panelinde "Bağlantısız Hesaplar" listesi + elle silme, 207
> uyarısı artık e-postayla ve listeye bağlantıyla; bkz. "✅ KAPATILDI —
> Bağlantısız (yetim) Auth hesapları". `delete-tenant` storage kısmı ayrı
> BACKLOG'da. Aşağıdaki metin tarihsel kayıttır.

Silme sırasında `cleanupOrphanUserIfNeeded` hata verirse (`reason: "error"`)
üyelik satırı siliniyor, **Auth kaydı kalıyor**. Kişi hiçbir kuruma bağlı
değil ama hesabı yaşıyor.

Bu turdaki düzeltme **kullanıcıya görünen zararı kaldırdı**: aynı adres
tekrar eklendiğinde artık "davet gönderildi" yalanı yazılmıyor — kişi daha
önce giriş yaptıysa "mevcut şifresiyle girebilir" (doğru), hiç giriş
yapmadıysa davet yeniden gidiyor. **Kalan iş:** yetim Auth kayıtlarının
tespiti ve temizliği (süper admin'e görünür bir liste veya periyodik
temizlik). Aynı yetim sorununun daha büyük kaynağı `delete-tenant`'ın
storage temizliği yapmaması — birlikte ele alınmalı.

---

# 🟠 BUG — Manşet silmek haberin kapak görselini siliyordu (9 Eylül 2026)

**Durum:** Kod tarafı **düzeltildi**. SQL adımı **YOK**. Elle iş: aşağıdaki
5 manuel test.

**Hasar tespiti temiz (canlıda doğrulandı):** Paylaşılan dosya kullanan
manşet↔haber çifti **0 satır**; tüm tablolarda kırık (404) görsel **0**.
Bug canlıda hiç tetiklenmemiş — düzeltme önleyici.

## Bug neydi?

Haberden üretilen manşet, haberin `cover_image` **URL'ini kopyalıyordu** —
dosya kopyalanmıyordu. İki DB satırı tek fiziksel dosyayı gösteriyordu:

```
news.cover_image     = ".../images/{tenant}/news/kapak.webp"
headlines.image_url  = AYNI URL
```

Manşet silinirken bu dosya storage'dan kaldırılıyordu → **haber duruyor ama
kapağı 404**. Public bucket, versiyonlama yok → **geri getirilemez**.

**URL kopyalamanın üç tetikleyicisi vardı:**

1. **Otomatik senkron (en yaygın yol).** Haber editöründeki "Manşete çıkar"
   kutucuğu manşeti kendisi oluşturuyor —
   [haberler/[id]:318,332](<src/app/admin/(authenticated)/haberler/[id]/page.tsx>),
   [duyurular/[id]:279,292](<src/app/admin/(authenticated)/duyurular/[id]/page.tsx>).
   Admin manşet ekranına hiç girmeden paylaşımı yaratıyor.
2. **Manuel kaynak seçimi** — `manset/page.tsx` `handleSourceSelect`.
3. **Manşet modalında görseli değiştirme** — silme bile gerektirmiyordu:
   kaynağı A'dan B'ye çevirmek, yeni görsel yüklemek veya ImageUploader'da
   **X'e basmak** üçü de eski (haberin) dosyasını siliyordu.

## Neden bu çözüm (klasör sahipliği)

Reddedilen alternatifler:

- **Görseli kopyalamak:** senkron `haberler/[id]` içinde **her kayıtta**
  çalışıyor → aynı görselin N kopyası birikirdi; kopyalamazsan haber kapağı
  değişince manşet eskir (P4-iv yorumu tam bunu düzeltmek için yazılmış).
- **Referans sayımı:** kullanılmadığını kanıtlamak için 12 tabloya sorgu,
  her silmede, RLS altında. Yarın görselli yeni bir tablo eklenince listeyi
  güncellemeyi unutan kişi bug'ı **sessizce** geri getirir.

Seçilen: her modül kendi klasörüne yüklüyor (`{tenant_id}/{folder}/{dosya}`)
ve klasör adları çakışmıyor → **klasör segmenti zaten sahibin adı.**

## Kod tarafı (yapıldı)

- **`lib/storage.ts`** → `isOwnedPath(path, ownerFolders)` eklendi. Segment
  bazlı karşılaştırma: `"headlines"` sahipliği `"headlines/videos"`i kapsar,
  `"headlines-eski"`yi **kapsamaz**. Segment < 3 ise `false` (fail-safe).
- **`removeFilesFromStorage`** ve **`cleanupReplacedFile`** → opsiyonel
  `ownerFolders` parametresi; yabancı path sessizce atlanır (`console.info`
  ile loglanır, izsiz değil).
- **Parametre verilmezse eski davranış korunur** — bilinçli karar: zorunlu
  yapılsaydı 20+ çağrı noktası aynı anda değişecek, yanlış tahmin edilen bir
  klasör adı çalışan temizliği sessizce durduracaktı. Guard, paylaşımın
  gerçekten mümkün olduğu yere eklenir; paylaşım yalnızca **kodun bir URL
  kopyaladığı** yerde doğar (bugün: yalnız manşet). ImageUploader'da elle URL
  girişi yok, admin kendiliğinden paylaşım yaratamaz.
- **`manset/page.tsx`** → `HEADLINE_OWNED_FOLDERS = ["headlines"]`; hem silme
  hem replace yolu guard'lı. 3. tetikleyicinin üç varyantı (kaynak değiştirme
  / yeni görsel / X ile temizleme) `form.image_url`'i değiştirip **tek
  yoldan** geçiyor → tek guard yetiyor.
- **`manset/page.tsx`** → kaynaklı manşette ImageUploader altına bilgi satırı:
  *"Görsel haberden geliyor. Değiştirmek için haberi düzenleyin."*
- **`scripts/test-storage-ownership.mjs`** → 42 vaka, `npm run test:storage`.

**FAIL-SAFE:** Yeni bir modül eklenip guard unutulursa sonuç "dosya
silinmedi" (yetim) olur — "başkasının dosyası silindi" **değil**. Yetim
sonradan geri kazanılır; silinen görsel gelmez.

## Bilinen ve kabul edilen: yetim dosya

Kaynaklı manşetin kendi yüklediği görsel yoksa guard hiçbir şey silmez —
sorun yok. Ama manşet **kapağı haberden gelirken** admin araya kendi görselini
yükleyip sonra kaynağa dönerse, o `headlines/` dosyası yetim kalabilir.
Manşet tenant başına **10 ile sınırlı** ve görseller WebP (~80–200 KB), yani
hacim ihmal edilebilir. Asıl yetim kaynağı bu değil:
`delete-tenant` **hiç** storage temizliği yapmıyor ve ImageUploader dosyayı
anında yüklüyor (admin "İptal"e basarsa dosya kalıyor). Yetim toplayıcı
yazılacaksa oradan başlanmalı — ayrı iş.
> ✅ `delete-tenant` kısmı 10 Eylül 2026'da kapatıldı (bkz. "✅ KAPATILDI —
> `delete-tenant` storage temizliği"). ImageUploader "İptal" yetimi hâlâ açık.

## ⏰ ELLE — deploy sonrası manuel testler

Hepsi **gizli pencerede**. Test 1 ve 2 bug'ın kendisi.

| # | Adım | Beklenen |
|---|---|---|
| 1 | Kapaklı bir haberi "Manşete çıkar" ile yayınla → Manşetler'den o manşeti **sil** | Haberin kapağı **yerinde**; haber listesi ve detayında görsel görünüyor |
| 2 | Kaynaklı bir manşeti aç → ImageUploader'da **X**'e bas → Kaydet | Haberin kapağı **yerinde** |
| 3 | Kaynaklı manşeti aç | ImageUploader altında **"Görsel haberden geliyor…"** bilgi satırı görünüyor |
| 4 | **Özel** (custom) manşet oluştur, görsel yükle, sonra manşeti sil | Manşetin kendi görseli **silinmiş** (guard doğru dosyayı hâlâ siliyor) |
| 5 | Haberi düzenle → kapağı değiştir → kaydet | Hem haberde hem manşette **yeni** kapak; eski dosya temizlenmiş |

**Not:** Test 4 guard'ın fazla geniş olmadığını doğrular — yalnızca 1–3'ü
yapmak yeterli değil.

---

# 🔴 CANLI BUG — Admin panelinde YANLIŞ TENANT (8 Eylül 2026)

**Durum:** Kod tarafı **düzeltildi**. Elle iş: aşağıdaki manuel testler +
`017_storage_tenant_rls.sql` (ayrı bölüm).

## Bug neydi?

`https://kurmayteknoloji.com` public sitesi **doğru** tenant'ı gösterirken
`https://kurmayteknoloji.com/admin` **default tenant'ın** verilerini
gösteriyordu (sidebar "Sendika Adı", default'un haber/duyuru sayaçları).

**Kök neden — tenant İKİ AYRI YOLDAN çözülüyordu:**

| | Public | Admin |
|---|---|---|
| Render | Server Component | Client Component |
| Kaynak | `getCurrentTenant()` → `x-tenant-slug` | `useTenant()` → `window.location.hostname` |
| custom_domain çözebiliyor mu | ✅ (middleware DB lookup) | ❌ |

`useTenant` önce slug ile arıyordu; custom_domain host'unda slug
`"default"`'a düşürülüyordu. **`default` tenant satırı HER ZAMAN vardır**
(`014_protect_default_tenant`), dolayısıyla ilk sorgu daima dolu dönüyor ve
arkasındaki custom_domain sorgusu (`if (!data)` ile korunmuş) **hiç
çalışmıyordu** — yazıldığı günden beri ölü koddu.

Panelin tamamı (Sidebar, dashboard sayaçları, 19 admin sayfası,
ImageUploader/RichTextEditor storage yolu) bu değeri kullanıyordu.

**Hasar tespiti (doğrulandı):** Kullanıcı yalnızca Kurmay Teknoloji üyesi,
süper admin değil → `012` RLS (`user_has_tenant_access`) yazma işlemlerini
reddetti, **DB'de veri kaybı YOK**. Gerçekleşen: default'un *yayınlanmış*
içeriğinin okunması (`001:172` `Public: news select` policy'sinde `TO`
kısıtı olmadığı için `authenticated` de kapsanıyor).

## Kod tarafı (yapıldı)

- **`admin/(authenticated)/layout.tsx:50,72`** → `<AdminShell initialTenant={tenant}>`
  (sunucunun zaten çözdüğü tenant aşağı geçiriliyor)
- **`AdminShell.tsx`** → `<TenantProvider initialTenant={...}>`
- **`hooks/useTenant.tsx`** → `initialTenant` varsa **istemci sorgusu hiç
  atılmaz**, `loading` hiç `true` olmaz. Tenant artık TEK yoldan gelir.
- **`lib/tenant-hostname.ts`** → `planTenantQuery()` + `needsClientResolve()`.
  Fallback **tek sorgu**, zincir yok: custom_domain bulunamazsa `null` —
  sessizce default'a düşmez. `extractSlugFromHostname` silindi (çağıranı
  kalmamıştı; "custom_domain → default" semantiği bu bug sınıfının kaynağıydı).
- **`middleware.ts`** → `/admin` ve `/super-admin` yolunda **fail-closed**:
  custom_domain çözülemezse `/admin/tenant-bulunamadi`'ya yönlendirir.
  Public tarafta graceful degradation **korundu**.
- **`admin/tenant-bulunamadi/page.tsx`** → yeni hata sayfası.
- **`scripts/test-tenant-resolve.mjs`** → 22 vaka, `npm run test:tenant`.

## ⏰ ELLE — deploy sonrası manuel testler

Aşağıdaki 6 testin **hepsi** geçmeden bug kapandı sayılmaz. Her testte
tarayıcı önbelleğini atlamak için **gizli pencere** kullanın.

| # | Adres | Beklenen |
|---|---|---|
| 1 | `https://kurmayteknoloji.com/admin` | Sidebar'da **Kurmay Teknoloji**, Kurmay'ın sayaçları |
| 2 | `https://www.kurmayteknoloji.com/admin` | 1 ile aynı |
| 3 | `https://kurmay-teknoloji.buyukdirilis.org.tr/admin` | 1 ile aynı (subdomain bozulmadı) |
| 4 | `https://buyukdirilis.org.tr/admin` | Default tenant (apex bozulmadı) |
| 5 | `https://kurmayteknoloji.com` (public) | Kurmay sitesi (regresyon yok) |
| 6 | Süper admin ile `/super-admin` | Panel açılır, tenant listesi tam |

**Ek kontrol (1'de):** Kurmay panelinden bir haber düzenleyip kaydedin →
Kurmay'ın public sitesinde göründüğünü, default'ta **görünmediğini**
doğrulayın.

**Fail-closed testi:** Süper admin panelinden geçici bir tenant'a
`custom_domain = test-yok.example.com` yazıp DNS'siz o adrese gitmek yerine,
daha basiti — mevcut bir custom_domain'i DB'den geçici silip `/admin`'e
gidin: **"Alan Adı Tanımlı Değil"** sayfası gelmeli, default panel
**açılmamalı**. Test sonrası değeri geri yazın.

---

# 🔴 CANLI BUG — `www.` ön eki tenant çözümünü kırıyordu (8 Eylül 2026)

**Durum:** Kod tarafı **düzeltildi**. İki elle adım **BEKLİYOR** (aşağıda).

## Bug neydi?

Bir tenant'ın `custom_domain`'i `kurmayteknoloji.com` iken:

- `https://kurmayteknoloji.com` → doğru tenant ✅
- `https://www.kurmayteknoloji.com` → **DEFAULT tenant** ❌

`parseHostname` "www." ön ekini **yalnızca** `www.{apex}` için ele alıyordu
(hardcoded `host === "www." + rootDomain` kontrolü). custom_domain dalında
www soyulmadığı için `.eq("custom_domain", "www.kurmayteknoloji.com")`
DB'deki `kurmayteknoloji.com` ile eşleşmiyor, `maybeSingle()` null dönüyor,
sistem **hata vermeden** default'a düşüyordu. **Her müşteride yaşanırdı.**

Aynı kök neden `www.{slug}.{apex}` için de geçerliydi (pratikte erişilemez:
wildcard DNS `A *` ve wildcard sertifika tek seviye kapsar).

## Kod tarafı (yapıldı)

- `src/lib/tenant-hostname.ts` — `stripWww()` eklendi, `parseHostname`
  **girişinde** uygulanıyor (port temizleme + lowercase ile aynı satırda).
  Kural: `"www."` ile başlıyor **ve** kalanda hâlâ nokta varsa soy.
  Çağıranda değil girişte, çünkü üç çağıran var (middleware, /api/contact,
  useTenant) — normalizasyon çağırana bırakılırsa dördüncüsünde unutulur.
- `normalizeCustomDomain()` eklendi + `create-tenant` / `update-tenant`
  bunu kullanıyor. **DB'de custom_domain daima apex formunda durmalı** —
  okuma tarafı www'yu soyduğu için `www.x.com` yazılan kayıt bir daha
  bulunamaz.
- `src/hooks/useTenant.tsx` — custom_domain lookup'ı ham
  `window.location.hostname` yerine `parseHostname(...).host` kullanıyor.
- `scripts/test-parse-hostname.mjs` — 55 vaka, `npm run test:hostname`.

## ⏰ ELLE ADIM 1 — DB'de www'lu custom_domain temizliği

`custom_domain` **UNIQUE** (009_multi_tenant_foundation.sql:45), bu yüzden
çakışma ön kontrolü şart. Sırayla:

```sql
-- A) TESPİT
select id, slug, name, custom_domain
from public.tenants
where custom_domain ilike 'www.%';

-- B) ÇAKIŞMA ÖN KONTROLÜ (A satır döndürdüyse — C'DEN ÖNCE)
--    www'suz hali başka tenant'ta zaten varsa UPDATE unique ihlali verir.
select t.id as www_tenant, t.custom_domain,
       u.id as cakisan_tenant, u.custom_domain as cakisan_domain
from public.tenants t
join public.tenants u
  on u.custom_domain = regexp_replace(t.custom_domain, '^www\.', '')
 and u.id <> t.id
where t.custom_domain ilike 'www.%';

-- C) DÜZELTME (B boş döndüyse)
update public.tenants
set custom_domain = regexp_replace(custom_domain, '^www\.', '')
where custom_domain ilike 'www.%';

-- D) DOĞRULAMA — 0 dönmeli
select count(*) from public.tenants where custom_domain ilike 'www.%';
```

## ⏰ ELLE ADIM 2 — Nginx www→apex 301 (müşteri başına)

Kod düzeltmesinin **yerine değil, yanına**. Kod düzeltmesi bug'ı kapatır;
301 ise (a) SEO'da aynı içeriğin iki adreste servis edilmesini bitirir,
(b) **Supabase auth cookie'leri host bazlı** olduğu için www'da giriş yapan
adminin apex'te çıkış yapmış görünmesini engeller.

⚠️ Mevcut apex server bloğunda `server_name` satırında `www.<domain>`
**varsa çıkarılmalı** — yoksa 301 bloğu hiç eşleşmez.

```nginx
# --- Müşteri: kurmayteknoloji.com — www → apex 301 ---
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name www.kurmayteknoloji.com;

    ssl_certificate     /etc/letsencrypt/live/kurmayteknoloji.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kurmayteknoloji.com/privkey.pem;

    return 301 https://kurmayteknoloji.com$request_uri;
}

# http → https (apex + www birlikte)
server {
    listen 80;
    listen [::]:80;
    server_name kurmayteknoloji.com www.kurmayteknoloji.com;
    return 301 https://kurmayteknoloji.com$request_uri;
}
```

Sertifika www'yu kapsamıyorsa (`openssl s_client` ile doğrula):

```bash
certbot certonly --nginx -d kurmayteknoloji.com -d www.kurmayteknoloji.com
nginx -t && systemctl reload nginx
```

**Yeni müşteri eklerken checklist:** DNS `A` (apex + www) → sertifika
(apex + www) → nginx apex bloğu + www 301 bloğu → süper admin panelden
custom_domain (www'suz yaz; panel zaten soyar).

> **11 Eylül 2026:** bu checklist artık panelde — süper admin → kurum sayfası
> → **Kurulum Durumu** (her adımı canlı ölçer, hazır metinleri üretir; bkz.
> "🧭 KURULUM DURUMU"). Güncel **tam** Nginx şablonu oradadır: apex bloğu
> (www'suz) + www 301 + http → https tek dosyada; custom_domain artık ÖNCE
> yazılır (metinler ondan üretilir). Canlıda Kurmay apex bloğunun
> `server_name` satırında **www hâlâ var** (kullanıcı teyidi) →
> `https://www.kurmayteknoloji.com` 200 dönüyor, 301 devrede değil (11 Eylül
> ölçümü); panel bunu "Eksik" gösterir.

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

**Durum:** ✅ **Canlıda apply edildi ve doğrulandı (16 Ağustos 2026).**
⚠️ **026 apply edildikten sonra bu dosyayı canlıda TEKRAR ÇALIŞTIRMAYIN** —
`homepage_*_public_read` policy'lerini yeniden yaratır, 026'nın kapattığı
sızıntı geri açılır (aşağıdaki homepage_sections KAPATILDI bölümüne bakın;
sıfırdan kurulumda sıra: 025 → 026). Mevcut canlı DB'de veri kaybı/davranış
değişikliği YOK; asıl amacı **sıfırdan kurulan DB'lerin** (yeni müşteri
projesi) çalışması.

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

# 📦 VPS DEPLOY — ✅ TAMAMLANDI, CANLIDA (27 Ağustos 2026)

Bu bölüm 29 Temmuz 2026'da (Tur 2 / a2) **plan** olarak yazılmıştı. Deploy
gerçekleşti; aşağısı **canlı kuruluma göre** güncellendi. Vercel artık
kullanılmıyor — canlı ortam VPS.

## 0. Canlı ortam

- **Sunucu:** isimtescil VDS-Eko — `185.33.234.67`, 1 core / 2 GB RAM
- **İşletim sistemi:** Ubuntu 22.04.5 LTS
- **Uygulama dizini:** `/var/www/sendika-site` — **yalnız standalone çıktı**
  (PM2 buradan çalıştırır). Her deploy'da `rsync --delete` ile yeniden yazılır;
  `src/` ve `scripts/` yok, buraya elle konan dosya bir sonraki deploy'da silinir.
- **Kaynak dizini:** `/opt/build/sendika-site` — sunucudaki kaynak kod +
  script'ler. Storage yedeği cron'u (`scripts/backup-storage.mjs`) buradan
  çalışır; deploy'dan etkilenmez.
- **Runtime:** Node 20 (NodeSource) + PM2 (`pm2 startup systemd` kurulu,
  proses adı `sendika`)
- **Reverse proxy:** Nginx — config `/etc/nginx/sites-available/sendika`
- **Domain:** `buyukdirilis.org.tr` (kayıt: isimtescil, DNS paneli: dnsenable.com)

**Kurulumda yaşananlar** (yeni sunucu açılırsa tekrar gerekebilir):
- Sunucu **CentOS 7** ile geldi; Ubuntu 22.04'e çevrilmesi için isimtescil'e
  **ticket açıldı**.
- Kurulumda LVM'in tamamı ayrılmamıştı — kök dosya sistemi `lvextend` +
  `resize2fs` ile **10 GB → 18 GB** genişletildi. (Plan 20 GB SSD diyordu;
  kullanılabilir kök alan 18 GB.)

### DNS kayıtları

| Tip | Ad | Değer |
|---|---|---|
| A | `@` | 185.33.234.67 |
| A | `*` | 185.33.234.67 |

⚠️ **Wildcard `A *` kaydı ŞART.** Multi-tenant subdomain'ler
(`{slug}.buyukdirilis.org.tr`) onsuz çalışmaz.

### SSL — ⏰ 24 KASIM 2026'DA ELLE YENİLENECEK

Let's Encrypt **wildcard** sertifika, **manuel DNS-01** doğrulamasıyla alındı.

🔴 **OTOMATİK YENİLENMEZ.** `certbot renew` bunu yenileyemez — aynı certbot
komutu **tekrar elle** çalıştırılmalı ve doğrulama için **iki TXT kaydı**
dnsenable.com'a elle eklenmelidir. Bitiş tarihinden en az bir hafta önceye
hatırlatıcı koyun; sertifika düşerse tüm subdomain'ler dahil site kapanır.

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
```

Kopyalama (build makinesinde):
```bash
cp -r .next/static .next/standalone/.next/static
```

ℹ️ **Projede `public/` klasörü yok** — statik asset yalnızca `.next/static`
üzerinden geliyor. (Deploy sırasında doğrulandı: `cp -r public ...`
"No such file or directory" verdi.) İleride `public/` eklenirse
`rsync --delete` öncesi standalone'a kopyalanmalıdır.

Sonra `.next/standalone/` içeriği sunucuya rsync'lenir. `.env` PRODUCTION
değerleriyle sunucuda ayrıca oluşturulmalı (standalone `.env.local` taşımaz).

⚠️ Çalıştırma komutu için **4. Tuzak 1'e bakın** — `HOSTNAME` verilmemeli.

## 3. Deploy akışı (her güncellemede)

1. WSL (Ubuntu 22.04) içinde `~/projeler/sendika-site`:
   ```bash
   git pull
   npm run build          # WSL'de — Windows build'i Linux'ta ÇALIŞMAZ (sharp native binary)
   cp -r .next/static .next/standalone/.next/static
   rsync -avz --delete .next/standalone/ root@185.33.234.67:/var/www/sendika-site/
   ```
2. Sunucuda:
   ```bash
   pm2 restart sendika
   ```

ℹ️ **İki dizin — rsync yalnız birini etkiler:**

| Dizin | İçerik | Deploy'da |
|---|---|---|
| `/var/www/sendika-site` | Yalnız standalone çıktı (`server.js`, `.next`, trace edilmiş `node_modules`) — PM2 buradan çalışır | `rsync --delete` ile **yeniden yazılır**; kaynakta olmayan her şey silinir |
| `/opt/build/sendika-site` | Kaynak kod + script'ler (storage yedeği cron'u, süpürücü; DB yedeği `scripts/backup-db.sh` — cron geçişinden sonra) | **Dokunulmaz** — script değişikliği buraya ayrıca taşınmalı |

Script'leri ya da elle dosyaları `/var/www`'ya koymayın; cron ve script'ler
`/opt/build`'den çalışır.

## 4. İki tuzak (deploy sırasında yaşandı — tekrarlanmasın)

### Tuzak 1 — PM2'yi `HOSTNAME=127.0.0.1` ile başlatmayın

Next.js `request.url`'i **dinlediği adrese göre** üretiyor. `HOSTNAME`
127.0.0.1'e sabitlenince tüm yönlendirmeler `localhost:3000`'e gidiyor —
giriş, davet kabul, admin redirect'leri kırılıyor.

Doğrusu (`HOSTNAME` **verilmeden**):
```bash
PORT=3000 pm2 start server.js --name sendika
```
Nginx tarafında `X-Forwarded-Host` ve `X-Forwarded-Port` başlıkları da
gönderiliyor.

### Tuzak 2 — `NEXT_PUBLIC_*` BUILD ANINDA gömülür

Sunucudaki `.env` **client bundle'ı etkilemez**. Build alınırken WSL'deki
`.env` dosyasında `NEXT_PUBLIC_ROOT_DOMAIN=buyukdirilis.org.tr` olduğu
doğrulanmalı — lokalde `lvh.me` kalırsa canlıda tüm tenant/admin URL'leri
`*.lvh.me`'ye çıkar.

Build sonrası doğrulama:
```bash
grep -o "buyukdirilis.org.tr" .next/static/chunks/*.js
```

## 5. Supabase Auth URL Configuration (✅ yapıldı)

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://buyukdirilis.org.tr`
- **Redirect URLs** (ikisi de ekli):
  - `https://buyukdirilis.org.tr/admin/davet-kabul`
  - `https://*.buyukdirilis.org.tr/admin/davet-kabul`

Wildcard satırı olmadan subdomain'e düşen davet/şifre-sıfırlama linkleri
reddedilir.

> ⏰ **10 Eylül 2026 — desen güncellemesi:** davet linkleri artık
> `?tenant=<uuid>` taşıyor. Apex satırı Site URL ile aynı host olduğu için
> değişmeden de çalışır; sonuna `*` eklemek **önerilir**. Lokal
> `http://*.lvh.me:3000/admin/davet-kabul` satırının sonuna `*` **zorunlu**.
> Ayrıntı: "✅ KAPATILDI — Davet kabulünde yanlış kurum" → "Redirect URLs
> deseni".

> ✅ **11 Eylül 2026 — custom domain satırları:** kurmayteknoloji.com için
> 4 satır eklendi (apex/www varyantları, sonda `*`) — şifre sıfırlama artık
> çalışıyor. Kural: custom domain başına **2 satır** (apex zorunlu + www
> savunma); panel üretir ve canlı kontrol eder (KURULUM.md Adım 6.1;
> "🧭 KURULUM DURUMU"). Domain değişince eski satırlar silinmeli.

## 6. Sunucu hazırlığı (2 GB gerçeği)

- ✅ **Swap — gerek kalmadı.** Sunucu **1.7 GB swap ile geldi** (`free -h`
  ile doğrulandı), elle açmaya gerek olmadı. Yeni bir sunucuda swap yoksa:
  `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` + fstab satırı.
- ✅ **Tek Node prosesi — yapıldı.** PM2 **fork_mode**, tek instance
  çalışıyor. 1 core'da PM2 cluster ANLAMSIZ; restart-on-crash yeterli.
  (Başlatma komutu için 4. bölüm Tuzak 1 — `HOSTNAME` verilmemeli.)
- **Nginx önde:** TLS + gzip + `/_next/static` için uzun Cache-Control.
  HSTS Nginx'te set edilecek (next.config'te bilerek yok — NOTE'taki CSP
  bölümüne bakın).

## 7. sharp doğrulaması (görsel optimizasyonu)

`sharp` artık dependency (package.json). Next 14.2 production'da sharp
yoksa WASM squoosh'a düşer: yavaş + bellek-tepeli → 2 GB'da OOM riski.
Deploy sonrası doğrula:
```bash
node -e "console.log(require('sharp').versions)"   # standalone dizininde
```
Ayrıca `node server.js` loglarında "sharp" uyarısı OLMAMALI. next/image
varyantları `.next/cache/images`'ta birikir — disk yeterli (kök fs 18 GB),
ama `.next/cache` rsync'e dahil edilmemeli (her deploy'da sıfırlanması sorun
değil, yeniden üretilir).

## 8. Deploy sonrası ilk hafta işleri (Tur 2 teşhisinden — sırayla)

- b1: Admin listelerine kolon listesi + pagination + arama debounce
- b2: Detay sayfalarında bağımsız sorguları Promise.all'a alma
- b3: Chrome sorgularına tenant-keyed unstable_cache (60 sn TTL) — tasarım
  şartları Tur 2 teşhis raporu madde 6'da (sızıntı riskine dikkat)
- b4: `news`/`announcements` composite index migration'ı +
  `homepage_section_items(section_id)` index'i
- Uptime monitor (Supabase Free 7 gün inaktivite pause + genel sağlık)

⏰ Deploy tamamlandığına göre bu liste artık **aktif** — sırayla ele alınacak.

## 9. ✅ Kapatıldı (27 Ağustos 2026)

- `src/lib/tenant-hostname.ts` başlık yorumu güncellendi. Eski hâli
  *"Production'da Vercel'e `NEXT_PUBLIC_ROOT_DOMAIN=sendika-site.vercel.app`
  eklenmelidir"* diyordu. Yeni hâli canlı gerçeği yazıyor: VPS,
  `NEXT_PUBLIC_ROOT_DOMAIN=buyukdirilis.org.tr` ve değerin **build
  ortamında** (WSL) set edilmesi gerektiği uyarısı + `grep` doğrulaması
  (bkz. 4. bölüm Tuzak 2).

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

# ✅ KAPATILDI (16 Ağustos 2026) — homepage_sections public policy'leri tenant-agnostik

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

## ✅ Kapanış (16 Ağustos 2026)

**Durum:** Kod değişikliği tamamlandı, migration 026 hazır.
**SQL elle apply edilmeli — AMA kod deploy edildikten SONRA.**

Teşhiste public tarafta **5 sorgu** bulundu (yukarıdaki "4 sorgu" sayımı
`bolum/[id]`'deki `generateMetadata` sorgusunu atlamış); 5'inde de
`.eq("tenant_id")` + `.eq("is_active", true)` mevcut doğrulandı — homepage_*
sorgularının kendisinde eksik filtre regresyonu YOK.

Yapılanlar:

- **`(public)/bolum/[id]/page.tsx`** — sayfanın tamamı `createAdminClient`'a
  geçti (Y1 Parça B deseni, `yonetim-kurulu/[slug]` emsali). Sayfa yalnızca
  homepage_* sorguluyor, başka tablo etkilenmedi.
- **`(public)/page.tsx`** — YALNIZCA 2 homepage_* sorgusu ayrı
  `adminSupabase` client'ına taşındı; diğer ~8 sorgu anon client'ta kaldı.
  BİLEREK: manşet slug lookup'larında (`news`/`announcements`,
  `.in("id", ...)`) `.eq("is_published", true)` YOK — o filtreyi RLS
  uyguluyor. Service-role'e taşınsalardı yayınlanmamış içeriğe link
  üretirlerdi (Y1 Parça B'deki sessiz regresyonun eşi). Dosyada uyarı
  yorumu var: diğer sorgular admin client'a TAŞINMAMALI.
- **`supabase/migrations/026_drop_homepage_public_policies.sql`** — dört
  public policy ismini de `DROP POLICY IF EXISTS` ile düşürür (2 eski
  Dashboard ismi + 2 025 ismi → 025'in apply durumundan bağımsız çalışır;
  canlıda 025 apply edildiği için fiilen 025 isimleri düşer). İdempotent.
  `tenant_homepage_sections_all` + `tenant_homepage_section_items_all`
  (admin panel) KORUNUR.

## ⚠️ APPLY SIRASI (bozulursa public anasayfa bölümleri boşalır)

1. **ÖNCE** kod değişikliği commit + deploy (admin client'a geçmiş olmalı).
2. **SONRA** `026_drop_homepage_public_policies.sql` (Supabase SQL Editor).

Ters sıra: policy DROP'lanır ama kod hâlâ anon client kullanır → public
anasayfa bölümleri boş döner, `/bolum/[id]` 404 olur. (Lokalde ikisi aynı
anda test edilebilir; production'da sıra önemli.)

⚠️ **025'i 026'dan SONRA canlıda TEKRAR ÇALIŞTIRMAYIN** — 025 idempotent
yapısı gereği her koşumda `homepage_*_public_read` policy'lerini yeniden
yaratır; 026'dan sonra koşarsa kapatılan sızıntı GERİ AÇILIR. Sıfırdan
kurulumda sıra her zaman 025 → 026 (025'in "erken koşum" adımı dahil —
025'in SON koşumu 026'dan önce olmalı).

## Test

Kod sonrası (policy DROP'tan önce de çalışır):
- incognito → anasayfa bölümleri + `/bolum/<id>` geliyor mu
- Bir bölümü pasif işaretle → public'te GÖRÜNMEMELİ (regresyon testi)

Policy DROP sonrası: 026 dosya sonundaki (a)–(d) doğrulamaları. Özellikle
(c) curl testi: anon key ile `homepage_sections`/`homepage_section_items`
sorgusu **[]** dönmeli (cross-tenant sızıntının kapandığının kanıtı).

Rollback: 026 dosya sonundaki ROLLBACK bloğu (sızıntıyı geri açar).

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

> ⏰ **10 Eylül 2026:** ilk satırın sonuna `*` eklenmeli
> (`http://*.lvh.me:3000/admin/davet-kabul*`). Davet linkleri artık
> `?tenant=<uuid>` taşıyor; `*` olmadan desen eşleşmez ve lokal davetler
> sessizce Site URL'ine düşer. Bkz. "✅ KAPATILDI — Davet kabulünde yanlış
> kurum".

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

<p>Bu bağlantı 1 saat geçerlidir. Eğer siz değilseniz bu maili
görmezden gelebilirsiniz.</p>

<p>İyi çalışmalar.</p>
```

> **11 Eylül 2026:** metin eskiden "24 saat" diyordu — yanlıştı; canlı şablon
> "1 saat" olarak düzeltildi. Süreyi **Email OTP Expiration** (Authentication
> → Sign In / Providers → Email; = 3600 sn) belirler ve bu ayar şifre
> sıfırlamayla **ORTAKTIR**. Bkz. "✅ KAPATILDI — E-posta şablonlarında
> bağlantı süresi çelişkisi".

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

> "1 saat" **Email OTP Expiration** (= 3600 sn) ile uyumlu (11 Eylül 2026'da
> doğrulandı). Bu ayar davetle **ORTAKTIR** — değişirse Invite User şablonu da
> güncellenmeli.

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
