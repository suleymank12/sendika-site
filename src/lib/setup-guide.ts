/**
 * "Başlangıç Adımları" — kurum admini panelindeki kurulum rehberi, SAF mantık.
 * (19 Eylül 2026)
 *
 * NEDEN: panele ilk giren kurum admini 13 ekran görüyor ve nereden
 * başlayacağını bilmiyor. Süper admin tarafında canlı ölçümlü "Kurulum
 * Durumu" var; kurum admini tarafında karşılığı yoktu.
 *
 * TASARIM KARARLARI (teşhis turu, raporlar/2026-09-19-1312-…):
 *
 *  - ÖLÇÜLÜR, İŞARETLENMEZ. Onay kutusu yok; her madde her açılışta DB'den
 *    yeniden okunur. Süper admin listesiyle aynı ilke (elle işaretlenen
 *    "yapıldı" niyeti saklar, gerçeği değil).
 *
 *  - LİSTEYE GİRME ÖLÇÜTÜ: madde "sitede ZİYARETÇİNİN gördüğü bir boşluk"
 *    üretmeli ve bilinçli tercih OLAMAMALI. Bu yüzden listede YOK:
 *      · sosyal medya  — hesabı olmayabilir, footer ikonu zaten gizleniyor
 *      · favicon       — tarayıcı kendi ikonunu gösteriyor, boşluk yok
 *      · navbar rengi / anasayfa düzeni — varsayılan geçerli bir tercih
 *      · "menü hâlâ varsayılan 5 öğe" — çalışan ve makul bir menü;
 *        bunu eksik saymak bilinçli tercihi kusur ilan etmek olurdu
 *      · yönetim kurulu / şubeler — varsayılan menüde linkleri yok
 *    Galeri listede, ÇÜNKÜ varsayılan menüde "Galeri" bağlantısı var:
 *    menüde linki olan her şey listede olmalı (tutarlılık).
 *
 *  - SUÇLAYICI DİL YOK. Süper admindeki ❌ "Eksik" / ⚠️ "Uyarı" sözlüğü
 *    buraya taşınmadı: okuyan kişi teknik değil ve hiçbir şeyi yanlış
 *    yapmamış. İki durum var — yapıldı / yapılmadı. Her açık adımın metni
 *    ZİYARETÇİNİN gördüğünü anlatır, admin'in yapmadığını değil.
 *
 *  - OKUNAMAZSA SUSAR. Sorgulardan biri patlarsa madde madde tahmin
 *    yürütülmez (sahte "eksik" üretir); `readable: false` döner, bileşen
 *    tek nötr satır gösterir. Süper admindeki "asla sahte Tamam"ın karşılığı.
 *
 * KARDEŞ LİSTE: süper admin → kurum sayfası → "Kurulum Durumu"
 * (lib/super-admin/setup-checklist.ts). Beş madde ortak (logo, iletişim,
 * kategori, menü, anasayfa bölümleri). Ortak olan YALNIZ eşikler; sunum
 * bilerek ayrı. Birine madde eklenirken diğeri gözden geçirilir.
 *
 * Göreli yol ".ts" uzantılı: Node test script'i (scripts/test-setup-guide.mjs)
 * bu dosyayı type stripping ile doğrudan çalıştırıyor ve uzantısız göreli
 * yolu çözemiyor.
 */

import { PLACEHOLDER_LOGO_URL } from "./constants.ts";

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

/**
 * Rehberin kalıcı kapatma bayrağı — site_settings'te tutulur, localStorage'da
 * DEĞİL.
 *
 * NEDEN site_settings: "biz manşet kullanmıyoruz" bir KURULUŞ kararıdır,
 * tarayıcı tercihi değil. localStorage cihaz/tarayıcı başına yazar — abi
 * ofiste kapatıp telefondan girince rehber geri gelirdi, yani "kalıcı
 * kapat" vaadi bozulurdu. Kurumda ikinci admin de olabiliyor
 * (tenant_users çoklu kayıt destekliyor); karar ikisi için de geçerli.
 *
 * Kabul edilen iki bedel: (1) site_settings'te public SELECT politikası var,
 * bu bayrak herkese açık okunabilir — anlamsız bir boolean. (2) Bayrak
 * getSiteSettings() çıktısına bir SATIR ekler; ek sorgu değil.
 */
export const SETUP_GUIDE_DISMISSED_KEY = "setup_guide_dismissed";

/**
 * Rehberin site_settings'ten okuduğu anahtarlar — TEK sorgu, `.in()` ile.
 * Dashboard bu diziyi aynen kullanır.
 */
export const SETUP_GUIDE_SETTING_KEYS = [
  "logo_url",
  "contact_phone",
  "contact_address",
  SETUP_GUIDE_DISMISSED_KEY,
] as const;

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export type SetupStepId =
  | "menu"
  | "logo"
  | "iletisim"
  | "kategori"
  | "haber"
  | "duyuru"
  | "manset"
  | "bolumler"
  | "galeri";

export interface SetupStep {
  id: SetupStepId;
  /** Kısa ad — tamamlanmış satırda tek başına görünür. */
  label: string;
  /** Yalnız açık adımda gösterilir: ziyaretçi ŞU AN ne görüyor. */
  detail: string;
  /** Buton metni (emir kipi, "sen" dili — panelin geri kalanıyla aynı). */
  action: string;
  href: string;
  done: boolean;
}

/**
 * Dashboard'un tek dalgada okuduğu ham veri.
 *
 * `null` = O SORGU HATA VERDİ (boş değil). Sayım `0` ile `null` arasındaki
 * fark bu rehberin can damarı: `0` "adım açık", `null` "bilmiyorum".
 */
export interface SetupGuideSnapshot {
  /** site_settings okunamadıysa null. */
  settings: Record<string, string | null> | null;
  /**
   * tenants.logo_url — public layout site_settings'ten ÖNCE buna bakıyor
   * ((public)/layout.tsx). Bugün hiçbir kod yazmıyor (hep NULL) ama tenant
   * nesnesi zaten bellekte olduğu için kontrol BEDAVA; ölü kolon bir gün
   * doldurulursa rehber yanlış konuşmasın.
   */
  tenantLogoUrl: string | null;
  counts: {
    menuItems: number | null;
    categories: number | null;
    news: number | null;
    announcements: number | null;
    headlines: number | null;
    sliders: number | null;
    homepageSections: number | null;
    galleryAlbums: number | null;
  };
}

export type SetupGuideResult =
  | {
      readable: false;
      /**
       * Okunamayan halde de taşınır: rehberi KAPATMIŞ birine, geçici bir
       * sorgu hatası yüzünden "Kurulum durumu okunamadı" satırı göstermek
       * kapatma vaadini bozar. Bayrak site_settings'ten geliyor; o okuma
       * başarılıyken yalnız bir sayım patladıysa tercih BİLİNİYOR demektir.
       * site_settings'in kendisi okunamadıysa false (bilinmiyor).
       */
      dismissed: boolean;
    }
  | {
      readable: true;
      dismissed: boolean;
      /** Sıra: önerilen ilerleme sırası (bağımlılığa göre), açık/kapalı karışık. */
      steps: SetupStep[];
      total: number;
      doneCount: number;
      allDone: boolean;
    };

// ---------------------------------------------------------------------------
// Eşikler — kardeş listeyle ORTAK olanlar
// ---------------------------------------------------------------------------

/**
 * Logo yüklendi mi?
 *
 * Kural public site'ın kuralının AYNISI olmalı — rehber, ziyaretçinin
 * gördüğünü anlatıyor. `(public)/layout.tsx`:
 *   `tenant.logo_url || settings.logo_url || PLACEHOLDER_LOGO_URL`
 * yani BOŞ OLMAYAN İLK değer kazanır; o değer tohum sentinel'i ise Navbar
 * harf avatarına düşer. Dolayısıyla `tenant.logo_url` sentinel'ken
 * `settings.logo_url` gerçek bir logo olsa bile ziyaretçi logoyu GÖRMEZ →
 * adım açık kalır. (Bugün `tenants.logo_url` ölü kolon, hep NULL; bu dal
 * kolon bir gün doldurulursa diye birebir aynı sırayı izliyor.)
 */
export function hasRealLogo(
  tenantLogoUrl: string | null,
  settingsLogoUrl: string | null | undefined
): boolean {
  const value = (tenantLogoUrl ?? "").trim() || (settingsLogoUrl ?? "").trim();
  return value !== "" && value !== PLACEHOLDER_LOGO_URL;
}

/** Boş/whitespace ayar değeri girilmemiş sayılır. */
function filled(value: string | null | undefined): boolean {
  return (value ?? "").trim() !== "";
}

// ---------------------------------------------------------------------------
// Değerlendirme
// ---------------------------------------------------------------------------

function step(
  id: SetupStepId,
  label: string,
  detail: string,
  action: string,
  href: string,
  done: boolean
): SetupStep {
  return { id, label, detail, action, href, done };
}

/**
 * İletişim adımının metni eksiğe göre değişir — "telefon ve adres yok"
 * demek, yalnız telefonu boş olan birine yanlış bilgi verir.
 */
function contactDetail(phone: boolean, address: boolean): string {
  if (!phone && !address) {
    return "İletişim sayfasında telefon ve adres görünmüyor, harita da çıkmıyor.";
  }
  if (!phone) return "İletişim sayfasında telefon numarası görünmüyor.";
  return "İletişim sayfasında adres ve harita görünmüyor.";
}

export function evaluateSetupGuide(snapshot: SetupGuideSnapshot): SetupGuideResult {
  const { settings, tenantLogoUrl, counts } = snapshot;

  // Tek bir okuma bile başarısızsa hiçbir madde hakkında konuşulmaz.
  if (settings === null) return { readable: false, dismissed: false };

  // Kapatma tercihi sayımlardan ÖNCE okunur: sayım patlasa bile bu bilgi
  // elimizde ve rehberi gizlemiş kişiye hiç konuşmamamız gerekiyor.
  const dismissed = (settings[SETUP_GUIDE_DISMISSED_KEY] ?? "") === "true";

  if (Object.values(counts).some((c) => c === null)) return { readable: false, dismissed };

  const c = counts as { [K in keyof typeof counts]: number };

  const phone = filled(settings.contact_phone);
  const address = filled(settings.contact_address);

  const steps: SetupStep[] = [];

  // 0) Site menüsü — YALNIZ 0 öğedeyken listeye girer.
  //    Menüyü kurulum tohumluyor (create-tenant, 5 öğe). Sıfırsa ya o insert
  //    patlamıştır (route 207 döner, uyarı yalnız SÜPER ADMİNE gider) ya da
  //    öğeler elle silinmiştir; her iki durumda navbar bomboştur ve kurum
  //    admini nereye bakacağını bilmez. Dolu menüyü "tamamlandı" diye
  //    listelemiyoruz: onu admin yapmadı, kurulum yaptı.
  if (c.menuItems === 0) {
    steps.push(
      step(
        "menu",
        "Site menüsü",
        "Sitenin üst menüsü boş — ziyaretçi hiçbir sayfaya ulaşamıyor.",
        "Menüyü düzenle",
        "/admin/menu",
        false
      )
    );
  }

  // 1) Logo — her sayfada görünür, 1 dakikalık iş.
  steps.push(
    step(
      "logo",
      "Logo",
      "Şu an sitede logo yerine sitenin baş harfi görünüyor.",
      "Logo yükle",
      "/admin/ayarlar#genel",
      hasRealLogo(tenantLogoUrl, settings.logo_url)
    )
  );

  // 2) İletişim bilgileri — adres yoksa harita bölümü hiç render edilmiyor.
  steps.push(
    step(
      "iletisim",
      "İletişim bilgileri",
      contactDetail(phone, address),
      "Bilgileri gir",
      "/admin/ayarlar#iletisim",
      phone && address
    )
  );

  // 3) Haber kategorileri — 4. adımın ön koşulu. Kurulum kategori
  //    oluşturmuyor; kategorisiz haber kaydedilebilir ama kategori sonradan
  //    eklenince eski haberlere tek tek dönmek gerekir.
  steps.push(
    step(
      "kategori",
      "Haber kategorileri",
      "Haber eklerken seçebileceğin kategori yok.",
      "Kategori ekle",
      "/admin/kategoriler",
      c.categories > 0
    )
  );

  // 4) İlk haber. "Manşete Ekle" işaretlenirse 6. adım da kapanır.
  steps.push(
    step("haber", "İlk haber", "Haberler sayfası boş.", "Haber ekle", "/admin/haberler/yeni", c.news > 0)
  );

  // 5) İlk duyuru.
  steps.push(
    step(
      "duyuru",
      "İlk duyuru",
      "Duyurular sayfası boş.",
      "Duyuru ekle",
      "/admin/duyurular/yeni",
      c.announcements > 0
    )
  );

  // 6) Manşet — manşet YOKSA kapak görselleri devreye giriyor; ikisi de
  //    boşsa anasayfanın en üstünde ziyaretçiye dönük "Manşet Eklenmemiş"
  //    kutusu çıkıyor (HeadlineSlider / FullWidthSlider). İki layout'ta da.
  steps.push(
    step(
      "manset",
      "Manşet",
      'Anasayfanın en üstünde "Manşet Eklenmemiş" kutusu görünüyor. Bir haberi manşete taşıyarak da doldurabilirsin — haber eklerken "Manşete Ekle" kutusunu işaretle.',
      "Manşet ekle",
      "/admin/manset",
      c.headlines > 0 || c.sliders > 0
    )
  );

  // 7) Anasayfa bölümleri — kurulum hiç bölüm eklemiyor, yeni kurumda
  //    daima 0. Pasif bölüm ziyaretçiye görünmediği için sayım is_active.
  steps.push(
    step(
      "bolumler",
      "Anasayfa bölümleri",
      "Anasayfanın alt kısmı boş.",
      "Bölüm ekle",
      "/admin/anasayfa-bolumleri",
      c.homepageSections > 0
    )
  );

  // 8) Galeri — varsayılan menüde "Galeri" bağlantısı var; albüm yoksa o
  //    bağlantı boş bir sayfaya gidiyor.
  steps.push(
    step(
      "galeri",
      "Fotoğraf galerisi",
      "Menüdeki Galeri bağlantısı boş bir sayfaya gidiyor.",
      "Albüm aç",
      "/admin/galeri",
      c.galleryAlbums > 0
    )
  );

  const doneCount = steps.filter((s) => s.done).length;

  return {
    readable: true,
    dismissed,
    steps,
    total: steps.length,
    doneCount,
    allDone: doneCount === steps.length,
  };
}

/**
 * Başlık satırı özeti: "8 adımdan 3 tanesi tamam".
 *
 * "3'ü / 5'i / 6'sı" biçimindeki iyelik eki Türkçede rakamın OKUNUŞUNA göre
 * değişiyor (üçü, beşi, altısı, sekizi…) — tek şablonla üretilemez, yanlış
 * ek panelde göze batar. "N tanesi" her rakamda doğru çalışıyor.
 */
export function summarizeSetupGuide(doneCount: number, total: number): string {
  if (total > 0 && doneCount === total) return "Hepsi tamam";
  if (doneCount === 0) return `${total} adım`;
  return `${total} adımdan ${doneCount} tanesi tamam`;
}
