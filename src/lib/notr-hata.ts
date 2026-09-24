/**
 * Tum notr hata yuzeylerinin ORTAK metni (C7, 24 Eylul 2026): app/error.tsx,
 * app/global-error.tsx ve route handler 503'leri. Kurum adi, marka ve hata
 * ayrintisi YOK; ayrinti yalniz sunucu log'una gider. Istemci bilesenleri de
 * iceri aldigi icin bu dosya sunucu modulu (next/headers vb.) iceri ALMAZ.
 */
export const NOTR_HATA_METNI = "Geçici bir sorun oluştu, lütfen biraz sonra tekrar deneyin.";
