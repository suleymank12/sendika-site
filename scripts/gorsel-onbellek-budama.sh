#!/usr/bin/env bash
#
# GORSEL ONBELLEGI BUDAMA — /_next/image disk onbellegine ust sinir.
# (21 Eylul 2026, Faz 1 — GHSA-3x4c-7xq6-9pq8)
#
# KULLANIM:
#   gorsel-onbellek-budama.sh DIZIN [SINIR_MB=1024] [YAS_GUN=30]
#
# CRON (root, saatte bir; betik /opt/build'den calisir, deploy'dan etkilenmez):
#   40 * * * * /bin/bash /opt/build/sendika-site/scripts/gorsel-onbellek-budama.sh /var/www/sendika-site/.next/cache/images 1024 30 >> /var/log/gorsel-onbellek.log 2>&1
#
# NEDEN: Next 14.2'nin gorsel onbellegi (`.next/cache/images`) SINIRSIZ
# buyur; ust sinir ayari (`images.maximumDiskCacheSize`) 15.5.14'te geldi.
# Faz 1'den sonra varyant uzayi zaten dar (yalniz bizim proje × q=75 ×
# 16 genislik × 2 bicim; 21 Eylul: 79 nesne → en fazla ~2.500 varyant,
# kabaca birkac yuz MB). Bu betik "kotu gun" sigortasi: disk (kok 18 GB)
# hicbir kosulda gorsellerle dolmasin.
#
# NE YAPAR (sirayla):
#   1) YAS_GUN'den eski varyant dosyalarini siler (kullanilan varyant her
#      saat yenilendigi icin mtime'i taze kalir; eskiyen = kimsenin
#      istemedigi).
#   2) Toplam SINIR_MB'yi asiyorsa EN ESKIDEN baslayarak sinirin %80'ine
#      iner (%80: her saat sinirin kiyisinda salinmasin).
#   3) Bosalan varyant dizinlerini siler. Kok dizin kalir.
#
# 🔴 GUVENLIK KAPISI: dizin `.../.next/cache/images` ile BITMEK zorunda;
# degilse HICBIR SEY silinmez, cikis 2. Yanlis argumanla cron'un baska bir
# dizini budamasi imkansiz. Yalniz 2. derinlikteki DOSYALARA dokunur
# (images/<anahtar>/<varyant>) — Next'in duzeni bu (image-optimizer.js
# writeToCacheDir).
#
# Next calisirken silmek GUVENLI: silinen varyant bir sonraki istekte
# onbellek iskalamasi olur ve yeniden uretilir (readdir/readFile hatalari
# Next'te yakalaniyor).
#
# Cikis: 0 = tamam (dizin yoksa da 0 — henuz gorsel istenmemis), 2 = arguman.
# Test: scripts/test-gorsel-onbellek-budama.sh

set -u

DIZIN="${1:-}"
SINIR_MB="${2:-1024}"
YAS_GUN="${3:-30}"
HEDEF_ORAN=80

hata() {
  echo "gorsel-onbellek HATA: $*"
  exit 2
}

case "$SINIR_MB" in '' | *[!0-9]*) hata "SINIR_MB pozitif tam sayi olmali: '$SINIR_MB'" ;; esac
case "$YAS_GUN" in '' | *[!0-9]*) hata "YAS_GUN pozitif tam sayi olmali: '$YAS_GUN'" ;; esac
[ "$SINIR_MB" -ge 1 ] || hata "SINIR_MB en az 1 olmali"
[ "$YAS_GUN" -ge 1 ] || hata "YAS_GUN en az 1 olmali"

DIZIN="${DIZIN%/}"
case "$DIZIN" in
  */.next/cache/images) ;;
  *) hata "dizin '.../.next/cache/images' ile bitmeli: '$DIZIN' — hicbir sey silinmedi" ;;
esac

if [ ! -d "$DIZIN" ]; then
  echo "gorsel-onbellek: $(date '+%F %T') dizin yok ($DIZIN) — henuz gorsel istenmemis, is yok"
  exit 0
fi

once_kb=$(du -sk "$DIZIN" | cut -f1)

# (1) Yas
yas_silinen=$(find "$DIZIN" -mindepth 2 -maxdepth 2 -type f -mtime +"$YAS_GUN" -print -delete | wc -l)
find "$DIZIN" -mindepth 1 -maxdepth 1 -type d -empty -delete

# (2) Boyut
sinir_kb=$((SINIR_MB * 1024))
simdi_kb=$(du -sk "$DIZIN" | cut -f1)
boyut_silinen=0
if [ "$simdi_kb" -gt "$sinir_kb" ]; then
  gereken_kb=$((simdi_kb - sinir_kb * HEDEF_ORAN / 100))
  boyut_silinen=$(
    find "$DIZIN" -mindepth 2 -maxdepth 2 -type f -printf '%T@ %k %p\n' |
      sort -n |
      awk -v gereken="$gereken_kb" 'toplam < gereken { toplam += $2; sub(/^[^ ]+ [^ ]+ /, ""); print }' |
      while IFS= read -r dosya; do
        rm -f -- "$dosya" && echo x
      done | wc -l
  )
  find "$DIZIN" -mindepth 1 -maxdepth 1 -type d -empty -delete
fi

sonra_kb=$(du -sk "$DIZIN" | cut -f1)
echo "gorsel-onbellek: $(date '+%F %T') once_kb=$once_kb sonra_kb=$sonra_kb yas_silinen=$yas_silinen boyut_silinen=$boyut_silinen sinir_mb=$SINIR_MB yas_gun=$YAS_GUN"
exit 0
