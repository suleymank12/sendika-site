// Admin paneldeki her sayfa için yardım içerikleri.
// Kısa, öz, eyleme dönük cümleler — okumayı kolaylaştırır.

export interface HelpStep {
  text: string;
  outcome?: string;
}

export interface HelpField {
  name: string;
  description: string;
  example?: string;
  required?: boolean;
}

export interface HelpSection {
  id: string;
  title: string;
  body?: string;
  steps?: HelpStep[];
  fields?: HelpField[];
  warnings?: string[];
  tips?: string[];
}

export interface HelpTopic {
  title: string;
  intro: string;
  sections: HelpSection[];
}

export const helpContent: Record<string, HelpTopic> = {
  dashboard: {
    title: "Özet",
    intro: "Yönetim panelinin anasayfası. Genel durumu görür, hızlı işlemlere ulaşırsın.",
    sections: [
      {
        id: "ozet",
        title: "Sayfada ne var?",
        body: "Üstte hızlı işlem kartları, ortada toplam içerik istatistikleri, altta son eklenen haber ve duyurular.",
      },
      {
        id: "kullanim",
        title: "Hızlı İpuçları",
        tips: [
          "Hızlı işlem kartlarına tıklayarak yeni haber/duyuru/sayfa ekleyebilirsin.",
          "Son haberler/duyurular listesinden başlığa tıklayıp doğrudan düzenleyebilirsin.",
          "Sağ üstteki menüden 'Siteyi Görüntüle' ile ziyaretçi tarafını yeni sekmede açabilirsin.",
        ],
      },
    ],
  },

  haberler: {
    title: "Haberler",
    intro: "Sitedeki haberleri yönetirsin. Buradan eklediklerin anasayfada ve haberler sayfasında görünür.",
    sections: [
      {
        id: "yeni",
        title: "Yeni Haber Ekle",
        steps: [
          { text: "Sağ üstte '+ Yeni Haber'e bas." },
          { text: "Başlığı yaz.", outcome: "Listede ve detay sayfasında en üstte görünür." },
          { text: "Kategori seç.", outcome: "Ziyaretçi haberleri kategoriye göre filtreleyebilir." },
          { text: "Özet alanına 2-3 cümle yaz.", outcome: "Kartlarda başlığın altında görünen metin." },
          { text: "İçerik kutusuna tam metni yaz.", outcome: "Detay sayfasında okunan asıl içerik." },
          { text: "Kapak görseli yükle.", outcome: "Kartlarda ve detay sayfasının üstünde gösterilir." },
          { text: "İstersen video, YouTube veya galeri görselleri ekle." },
          { text: "'Manşete Ekle'yi işaretlersen anasayfa manşet alanında öne çıkar. Manşet yalnızca yayındaki haberlerde görünür; haberi taslağa alırsan manşetten otomatik kalkar, tekrar yayınlayınca geri gelir." },
          { text: "'Yayınla' veya 'Taslak Kaydet'e bas.", outcome: "Yayınla = ziyaretçiye açık. Taslak = sadece sen görürsün." },
        ],
      },
      {
        id: "alanlar",
        title: "Form Alanları",
        fields: [
          { name: "Başlık", description: "Haberin adı.", required: true },
          { name: "URL Kısa Adı", description: "Haberin internet adresi. Başlıktan otomatik oluşur." },
          { name: "Kategori", description: "Filtreleme için. Boş bırakılabilir." },
          { name: "Özet", description: "Kartlarda gösterilen kısa açıklama." },
          { name: "İçerik", description: "Haberin tam metni. Zengin metin editörü kullanılır." },
          { name: "Kapak Görseli", description: "Listede ve detay sayfasının başında görünür." },
          { name: "Video / YouTube", description: "Habere video iliştirir. Detayda oynatıcı çıkar." },
          { name: "Galeri Görselleri", description: "Detay sayfasında foto galerisi olarak gösterilir." },
          { name: "Manşete Ekle", description: "Haber anasayfa manşetine otomatik düşer." },
        ],
      },
      {
        id: "yonetim",
        title: "Düzenleme & Silme",
        body: "Listede satıra tıklayıp düzenleyebilir, çöp kutusu ile silebilirsin. Kaydetmeden sayfadan ayrılmaya çalışırsan panel seni uyarır — değişiklikler sessizce kaybolmaz.",
        warnings: [
          "Silme işlemi geri alınamaz. Geçici gizleme için 'Taslak Kaydet' kullan.",
          "Manşetteki haberi silersen manşetten de otomatik kalkar.",
        ],
      },
    ],
  },

  duyurular: {
    title: "Duyurular",
    intro: "Üyelere ve ziyaretçilere ulaştırmak istediğin resmi bilgilendirmeler.",
    sections: [
      {
        id: "fark",
        title: "Haberden Farkı",
        body: "Haber: gerçekleşmiş olayların aktarımı. Duyuru: gelecekte yapılacak veya bilinmesi gereken resmi bildirim (toplantı çağrısı, ilan, son tarih).",
      },
      {
        id: "yeni",
        title: "Yeni Duyuru Ekle",
        steps: [
          { text: "'+ Yeni Duyuru'ya bas." },
          { text: "Başlık ve özeti yaz." },
          { text: "İçerik kutusuna tam metni yaz." },
          { text: "İstersen kapak görseli yükle." },
          { text: "Öne çıkarmak istersen 'Manşete Ekle'yi işaretle. Duyuruyu taslağa alırsan manşetten otomatik kalkar, tekrar yayınlayınca geri gelir." },
          { text: "'Yayınla'ya bas.", outcome: "Duyuru hemen siteye yansır." },
        ],
        tips: [
          "Asıl mesaj ilk cümlede yer alsın.",
          "Resmi belgeleri içerik editöründen link olarak ekleyebilirsin.",
        ],
      },
    ],
  },

  slider: {
    title: "Anasayfa Slider",
    intro: "Anasayfanın üstünde dönen büyük görsel alan. Öne çıkarmak istediklerin için kullanılır.",
    sections: [
      {
        id: "fark",
        title: "Manşetten Farkı",
        body: "Slider sayfanın en üstünde, kapak gibi davranır. Manşet ise içerik bölümünde öne çıkan haberler için kullanılır.",
      },
      {
        id: "yeni",
        title: "Yeni Slide Ekle",
        steps: [
          { text: "'Yeni Slide Ekle'ye bas." },
          { text: "Görsel yükle (yatay/geniş format önerilir; sistem görseli otomatik optimize eder)." },
          { text: "Başlık ve alt başlık ekle (isteğe bağlı).", outcome: "Görselin üstünde yazı olarak gösterilir." },
          { text: "Bağlantı (URL) gir.", outcome: "Slide'a tıklayan kullanıcı bu adrese yönlenir." },
          { text: "'Aktif' işaretli kaydet." },
        ],
        tips: [
          "3-4 slide ideal, fazlası ziyaretçinin tamamını görmesini engeller.",
          "Listeyi sürükle-bırak ile yeniden sıralayabilirsin.",
        ],
      },
    ],
  },

  manset: {
    title: "Manşetler",
    intro: "Anasayfanın öne çıkan haber/duyuru bölümü. 'Günün haberi' niteliğindeki içerikleri vurgular.",
    sections: [
      {
        id: "yeni",
        title: "Yeni Manşet Ekle",
        steps: [
          { text: "'Yeni Manşet Ekle'ye bas." },
          { text: "Kaynak türü seç.", outcome: "Haber: mevcut bir habere bağlanır. Duyuru: mevcut duyuruya bağlanır. Özel: kendi başlık ve görselini yazarsın." },
          { text: "Haber veya Duyuru türünü seçtiysen listeden içeriği de seç — seçmeden kayıt yapılmaz." },
          { text: "Görsel, başlık, alt başlığı doldur." },
          { text: "'Aktif' olarak kaydet." },
        ],
        warnings: ["En fazla 10 manşet eklenebilir."],
        tips: [
          "Bir haberi manşet yapmanın en kolay yolu: haber düzenleme sayfasında 'Manşete Ekle' kutusunu işaretlemek.",
        ],
      },
      {
        id: "yonetim",
        title: "Sıralama & Aktiflik",
        body: "Sürükle-bırak ile sıralayabilir, göz ikonu ile silmeden gizleyebilirsin.",
      },
    ],
  },

  menu: {
    title: "Site Menüsü",
    intro: "Sitenin üstünde görünen ana menüyü düzenlersin.",
    sections: [
      {
        id: "yeni",
        title: "Yeni Menü Öğesi",
        steps: [
          { text: "'Yeni Menü Öğesi'ne bas." },
          { text: "Başlık yaz (örn. 'Hakkımızda')." },
          { text: "URL gir.", outcome: "Site içi: /hakkimizda. Dış site: https://..." },
          { text: "Üst menü mü, alt menü mü olacağını seç." },
          { text: "'Aktif' olarak kaydet." },
        ],
      },
      {
        id: "yonetim",
        title: "Sıralama",
        body: "Sol tutamaktan sürükleyerek sıralarsın. Bir öğeyi başka birinin altına sürükleyerek alt menü yaparsın.",
        warnings: [
          "Bir menüyü silmek alt menülerini de siler.",
          "Üst menüde 5-7 öğe ideal, fazlası ziyaretçinin kafasını karıştırır.",
        ],
        tips: [
          "Alt menüsü olan öğede URL gerekmez — üst öğe tıklanınca yalnızca menüyü açar.",
        ],
      },
    ],
  },

  sayfalar: {
    title: "Sabit Sayfalar",
    intro: "Hakkımızda, Tüzük, Misyon Vizyon gibi statik içerikli sayfalar oluşturursun.",
    sections: [
      {
        id: "yeni",
        title: "Yeni Sayfa Oluştur",
        steps: [
          { text: "'Yeni Sayfa'ya tıkla." },
          { text: "Başlık yaz.", outcome: "URL otomatik oluşur, sayfa /sayfa/baslik adresinden erişilebilir." },
          { text: "İçerik editöründen tam metni yaz." },
          { text: "'Yayınla'ya bas." },
          { text: "Menüye eklemek istersen 'Site Menüsü'nden URL olarak '/sayfa/...' yaz." },
        ],
        warnings: [
          "Kısa adı 'hakkimizda', 'tuzuk' veya 'misyon-vizyon' olan sayfalar sitedeki Kurumsal menüsünü besler (/kurumsal/hakkimizda gibi). Bu kısa adları değiştirirsen ilgili kurumsal sayfa boş kalır.",
        ],
      },
      {
        id: "kullanim",
        title: "Hangi İçerikler İçin?",
        body: "Zaman içinde değişmeyen kurumsal sayfalar: hakkımızda, tarihçe, tüzük, gizlilik politikası vb. Sürekli akan içerikler için kullanma — onlar için Haberler/Duyurular var.",
      },
    ],
  },

  galeri: {
    title: "Foto Galeri",
    intro: "Fotoğrafları etkinliklere göre albümler halinde organize edersin.",
    sections: [
      {
        id: "album",
        title: "Yeni Albüm",
        steps: [
          { text: "'Yeni Albüm'e bas." },
          { text: "Başlık gir (örn. '8 Mart Etkinliği')." },
          { text: "Kapak görseli yükle.", outcome: "Galeri listesinde bu görselle gösterilir." },
          { text: "Kaydet." },
        ],
      },
      {
        id: "fotograf",
        title: "Albüme Fotoğraf Ekle",
        steps: [
          { text: "Albümün üzerine tıkla." },
          { text: "'Fotoğraf Ekle'ye bas." },
          { text: "Birden fazla fotoğraf seçebilirsin." },
          {
            text: "İstersen fotoğrafın üzerine gel, kalem simgesine tıkla ve açıklama ekle.",
            outcome: "Açıklama sitede fotoğrafın büyük görünümünde gösterilir.",
          },
        ],
        tips: [
          "Sistem fotoğrafları web için otomatik optimize eder; 50MB'tan büyük dosyalar yüklenmez.",
          "Albüm detayındaki 'Durum'u Taslak yaparsan albüm silinmeden sitede gizlenir.",
          "Albümleri sürükle-bırak ile sıralayabilirsin.",
        ],
      },
    ],
  },

  "yonetim-kurulu": {
    title: "Yönetim Kurulu",
    intro: "Sendikanın yönetim kurulu üyelerini yönetirsin.",
    sections: [
      {
        id: "uye",
        title: "Yeni Üye Ekle",
        steps: [
          { text: "'Yeni Üye'ye bas." },
          { text: "İsim Soyisim ve görev unvanını gir." },
          { text: "Fotoğraf yükle.", outcome: "Yönetim kurulu kartında bu fotoğraf görünür." },
          { text: "'Aktif' olarak kaydet." },
        ],
        tips: [
          "Kare (1:1) oranlı fotoğraflar (400x400 piksel) en iyi sonucu verir.",
          "Görevden ayrılan üyeyi silmek yerine 'Aktif'i kaldır — geçmiş için saklanır.",
          "Sürükle-bırak ile sıralayabilirsin (Genel Başkan en üstte gibi).",
        ],
      },
    ],
  },

  subeler: {
    title: "Şubeler",
    intro: "İl/ilçe şubelerinin iletişim bilgilerini yönetirsin.",
    sections: [
      {
        id: "yeni",
        title: "Yeni Şube Ekle",
        steps: [
          { text: "'Yeni Şube'ye bas." },
          { text: "Şube adı, şehir, adres, telefon, e-posta gir.", outcome: "Boş alanlar şube kartında görünmez." },
          { text: "'Aktif' olarak kaydet." },
        ],
        tips: [
          "Telefonu +90 ülke koduyla yaz, kullanıcı tek tıkla arayabilsin.",
          "Kapanan şubeyi silmek yerine 'Pasif' yap — bilgiler saklanır, sitede görünmez.",
          "Sürükle-bırak ile sıralayabilirsin.",
        ],
      },
    ],
  },

  kategoriler: {
    title: "Haber Kategorileri",
    intro: "Haberleri konularına göre gruplamak için kullanılan etiketler.",
    sections: [
      {
        id: "kullanim",
        title: "Nasıl Çalışır?",
        steps: [
          { text: "'Yeni Kategori'ye bas, ad gir, kaydet." },
          { text: "Bu kategori artık haber formundaki menüde seçenek olarak çıkar." },
          { text: "Pasif yapılan kategori artık seçilemez ama eski haberler etkilenmez." },
        ],
        warnings: [
          "Kullanılan kategoriyi silmek o kategorideki haberlerin kategorisini boşaltır. Silmek yerine pasif yap.",
        ],
        tips: ["5-10 kategori ideal, fazlası ziyaretçi için karmaşık olur."],
      },
    ],
  },

  "anasayfa-bolumleri": {
    title: "Anasayfa Bölümleri",
    intro: "Anasayfada özel içerik bölümleri oluşturursun (Yaklaşan Etkinlikler, Öne Çıkan Belgeler vb.).",
    sections: [
      {
        id: "ne-icin",
        title: "Ne İçin Kullanılır?",
        body: "Standart haber/duyuru bölümleriyle yetinmek yerine kendi temalı bölümlerini oluşturmak için.",
      },
      {
        id: "yeni",
        title: "Yeni Bölüm Ekle",
        steps: [
          { text: "'Yeni Bölüm'e bas." },
          { text: "Başlık yaz." },
          { text: "Kaynak türü seç.", outcome: "Haberler/Duyurular: otomatik gösterir. Özel: içerikleri sen eklersin." },
          { text: "Öğe sayısı ve düzeni (4'lü/8'li grid) seç." },
          { text: "Kaydet." },
          { text: "'Özel' seçtiysen bölümün içine girip kart kart öğe ekle." },
        ],
      },
    ],
  },

  ayarlar: {
    title: "Site Ayarları",
    intro: "Logo, favicon, sendika adı, iletişim, sosyal medya, renk gibi genel ayarları yönetirsin. Değişiklikler tüm sitede aynı anda yansır.",
    sections: [
      {
        id: "site",
        title: "Site Bilgileri",
        fields: [
          { name: "Logo", description: "Sol üst köşede görünür. Şeffaf arkaplanlı PNG önerilir." },
          { name: "Favicon", description: "Tarayıcı sekmesinde ve yer imlerinde görünen küçük ikon. Kare PNG (256x256 piksel) yüklenmesi önerilir. Boş bırakılırsa varsayılan ikon kullanılır." },
          { name: "Site Başlığı", description: "Tarayıcı sekmesinde ve footer'da görünen tam ad." },
          { name: "Site Açıklaması", description: "Google aramalarında altta gösterilen açıklama (SEO için önemli)." },
        ],
      },
      {
        id: "iletisim",
        title: "İletişim",
        body: "Buradaki bilgiler footer'da ve İletişim sayfasında görünür. Boş bıraktıkların gösterilmez.",
        fields: [
          { name: "Telefon", description: "Sendika merkez telefonu." },
          { name: "E-posta", description: "Sendika resmi e-posta adresi." },
          { name: "Adres", description: "Merkez ofis adresi." },
        ],
      },
      {
        id: "sosyal",
        title: "Sosyal Medya",
        body: "Sendikanın kullandığı sosyal medya hesaplarının tam URL'lerini gir. 11 farklı platform için alan var: Facebook, Twitter (X), Instagram, YouTube, LinkedIn, WhatsApp Kanalı, Telegram, TikTok, Threads, Bluesky, Spotify. Boş bıraktığın platformların ikonu footer'da görünmez — yalnızca kullandıklarını doldur.",
        tips: [
          "Hesabın tam adresini yapıştır (facebook.com/sendika gibi) — başındaki https:// eksikse sistem otomatik ekler. Yalnız kullanıcı adı yeterli değil.",
          "Hangi platformları kullanmıyorsan boş bırak; sitede sadece doldurduğun ikonlar görünecek.",
          "WhatsApp için kanal linkini kullan (https://whatsapp.com/channel/...), kişisel telefon numarası değil.",
        ],
      },
      {
        id: "tasarim",
        title: "Tasarım",
        fields: [
          { name: "Navbar Rengi", description: "8 hazır renkten biri seçilir. Bu renk butonlar ve diğer vurgularda da kullanılır." },
          { name: "Layout", description: "Anasayfa düzeni. Klasik: manşet sol/haberler sağ. Modern: tam genişlik manşet." },
        ],
        warnings: ["Navbar rengini değiştirdiğinde sitedeki tüm primary renk değişir."],
      },
      {
        id: "kaydet",
        title: "Kaydetme",
        body: "Sayfanın altındaki 'Kaydet'e basmadan değişiklikler uygulanmaz. Birkaç saniye sonra siteye yansır. Kaydetmeden sayfadan ayrılmaya çalışırsan panel seni uyarır.",
      },
    ],
  },
};

export function getHelpTopic(key: string): HelpTopic | null {
  return helpContent[key] ?? null;
}
