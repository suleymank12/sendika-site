# archive/ — Tarihsel migration'lar (001-026)

Bu klasördeki dosyalar **artık çalıştırılmaz**. Canlı veritabanına sırayla
uygulanmış olan gerçek geçmiştir; okumak, "bu kolon neden var / bu policy neden
böyle" sorusunu cevaplamak ve eski NOTE.md kayıtlarını takip etmek için
duruyorlar.

Sıfırdan kurulum artık tek yerden yapılır:

```
supabase/migrations/000_baseline.sql      <- tüm şema (canlının dökümü)
supabase/migrations/001_seed_default.sql  <- minimum tohum
```

Kurulum adımları: repo kökündeki **KURULUM.md**.

---

## Neden arşivlendi

Bu 25 dosya **sırayla çalıştırıldığında boş bir veritabanında çalışan bir şema
üretmiyordu.** Faz 1 teşhisinde altı kırılma noktası bulundu:

1. **005 → olmayan tabloya ALTER.** `005_consolidate_quick_access.sql`
   `homepage_section_items`'a `icon` kolonu ekliyor; o tablo ise 20 dosya sonra,
   `025_homepage_sections.sql`'de yaratılıyor. Boş DB'de 005 hata verir.

2. **005 → olmayan kolonları okur.** Aynı dosya `quick_access.slug`,
   `.content`, `.image_url`, `.video_url`, `.youtube_url` kolonlarını kullanıyor;
   bu kolonlar **hiçbir migration'da yaratılmıyor** (Dashboard'dan eklenmişler).
   Numara sırasındaki `006` boşluğu da buraya işaret ediyor.

3. **012 → olmayan tabloya POLICY.** `012_tenant_aware_rls.sql:138`
   `public.content_media` üzerinde policy yaratıyor; tablo
   `019_content_media.sql`'de yaratılıyor. Boş DB'de 012 hata verir.

4. **012 ↔ 019 karşılıklı bağımlılık (asıl tıkanma).** 012'nin 019'a ihtiyacı
   var (yukarıdaki madde). 019 ise `tenant_id`'yi `NOT NULL` yapmayıp "009 zaten
   doldurup NOT NULL yaptı" diyor — yani kendinden **önce** 009'un, dolayısıyla
   012'nin bağlamının kurulmuş olmasını varsayıyor. Hiçbir dosya sıralaması
   ikisini birden memnun etmiyor.

5. **7 kolon hiçbir migration'da yok.** Canlıda mevcut, doğrulandı:
   `news.video_url`, `news.youtube_url`, `announcements.video_url`,
   `announcements.youtube_url`, `headlines.content`, `headlines.video_url`,
   `headlines.youtube_url`. Sıfırdan kurulan bir DB bu kolonlar olmadan doğar;
   video ve manşet içeriği kırılır.

6. **025 iki kez çalıştırılmak zorunda.** Kendi başlığında yazıyor: "004'ten
   sonra bir kez erken, sırası gelince tekrar". Dosya sırası tek başına doğru
   sonucu vermiyor.

Kök sebep hepsinde aynı: **tablolar Supabase Dashboard'dan elle yaratıldı,
migration'a sonradan (019, 025) geri yazıldı.** Repo ile canlı arasındaki bu
kayma (drift) tek tek kapatılabilirdi ama sıralama çıkmazı (madde 4) çözülemez;
bu yüzden canlının kendisi tek doğruluk kaynağı kabul edilip baseline alındı.

---

## rollback/

`013`, `016`, `018` birer geri alma dosyasıdır — hiçbir zaman otomatik
uygulanmaz, ilgili migration hatalı çıkarsa elle çalıştırılmak için yazılmışlardı.
Karşılıkları: 013 → 012, 016 → 015, 018 → 017.

⚠️ Bu dosyalar **canlıya karşı çalıştırılmamalıdır**. Örneğin 018, storage
politikalarını tenant-aware olmayan eski hallerine döndürür; sonuç
**cross-tenant dosya silme/yazma** olur.

---

## Numaralandırma

Yeni migration'lar **027**'den devam eder (002'den değil). Sebep: `005`, `012`,
`022` gibi numaralar NOTE.md'de ve kod yorumlarında onlarca kez geçiyor; aynı
numaranın ikinci bir dosyaya verilmesi bu referansları sessizce yanlış hale
getirirdi.

```
000_baseline.sql        şema (üretilmiş dosya, elle düzenlenmez)
001_seed_default.sql    tohum (yalnızca yeni kurulum)
027_*.sql               buradan devam
archive/                001-026 (tarihsel)
archive/rollback/       013, 016, 018
```

Baseline'ın ne zaman yeniden üretileceği: **NOTE.md → "MIGRATION BASELINE"**.
