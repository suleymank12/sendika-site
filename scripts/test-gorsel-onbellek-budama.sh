#!/usr/bin/env bash
#
# gorsel-onbellek-budama.sh testi (21 Eylul 2026, Faz 1).
#
# CALISTIRMA:
#   npm run test:gorsel-onbellek
#   (= bash scripts/test-gorsel-onbellek-budama.sh)
#
# Gercek dosya sistemi uzerinde, gecici dizinde Next'in onbellek duzeni
# (images/<anahtar>/<varyant>) kurularak kosar. Stub yok.
#
# BU TEST NEYI DOGRULAR:
#   (a) guvenlik kapisi — '.../.next/cache/images' ile bitmeyen dizinde HICBIR
#       sey silinmez (sonek hilesi dahil), cikis 2
#   (b) arguman dogrulama — sayi olmayan / sifir sinir reddedilir
#   (c) dizin yoksa: is yok, cikis 0
#   (d) yas — eski varyant silinir, taze kalir, bos dizin temizlenir
#   (e) boyut — sinir asilinca EN ESKIDEN baslanir, %80'e inilir, en yeniler kalir
#   (f) sinir altinda boyut silmesi YOK
#   (g) kapsam — kardes dizinler (fetch-cache) ve 1. derinlikteki dosyalar
#       dokunulmaz; kok dizin kalir
#   (h) ozet satiri

set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO/scripts/gorsel-onbellek-budama.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

PASS=0
FAIL=0

ok() { # ad cikti beklenen
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); echo "  PASS  $1"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL  $1"; echo "          cikti : $2"; echo "          bekle : $3"
  fi
}
icerir() { # ad metin desen
  if printf '%s' "$2" | grep -Eq -- "$3"; then ok "$1" var var; else ok "$1" yok var; fi
}

# varyant ANAHTAR KB DAKIKA_ONCE  → images/ANAHTAR/3600.<zaman>.etag.webp
varyant() {
  local kok="$1" anahtar="$2" kb="$3" dk="$4"
  mkdir -p "$kok/$anahtar"
  local f="$kok/$anahtar/3600.1789951241225.e+t=ag.webp"
  head -c $((kb * 1024)) /dev/zero > "$f"
  touch -d "$dk minutes ago" "$f"
}
dosya_sayisi() { find "$1" -type f 2>/dev/null | wc -l | tr -d ' '; }

kos() { # arguman... → CIKTI, KOD
  CIKTI=$(bash "$SCRIPT" "$@" 2>&1)
  KOD=$?
}

# ---------------------------------------------------------------------------
echo "-- (a) guvenlik kapisi"
YEM="$T/yem"
mkdir -p "$YEM/icerik"
head -c 4096 /dev/zero > "$YEM/icerik/dosya"
touch -d "400 days ago" "$YEM/icerik/dosya"

kos
ok "(a) argumansiz → cikis 2" "$KOD" 2
kos "$YEM" 1 1
ok "(a) yanlis dizin → cikis 2" "$KOD" 2
ok "(a) yanlis dizinde dosya DURUYOR" "$(dosya_sayisi "$YEM")" 1
icerir "(a) mesaj: hicbir sey silinmedi" "$CIKTI" 'hicbir sey silinmedi'

HILE="$T/app/.next/cache/images-sahte"
varyant "$HILE" k1 4 600000
kos "$HILE" 1 1
ok "(a) sonek hilesi (images-sahte) → cikis 2" "$KOD" 2
ok "(a) sonek hilesinde dosya DURUYOR" "$(dosya_sayisi "$HILE")" 1

UST="$T/app/.next/cache"
kos "$UST" 1 1
ok "(a) bir ust dizin (.next/cache) → cikis 2" "$KOD" 2

# ---------------------------------------------------------------------------
echo "-- (b) arguman dogrulama"
D="$T/b/.next/cache/images"
varyant "$D" k1 4 600000
kos "$D" abc 30
ok "(b) SINIR_MB sayi degil → 2" "$KOD" 2
kos "$D" 0 30
ok "(b) SINIR_MB 0 → 2" "$KOD" 2
kos "$D" 1024 -5
ok "(b) YAS_GUN negatif → 2" "$KOD" 2
kos "$D" 1024 0
ok "(b) YAS_GUN 0 → 2" "$KOD" 2
ok "(b) hatali argumanlarda dosya DURUYOR" "$(dosya_sayisi "$D")" 1

# ---------------------------------------------------------------------------
echo "-- (c) dizin yok"
kos "$T/yok/.next/cache/images" 1024 30
ok "(c) cikis 0" "$KOD" 0
icerir "(c) 'dizin yok' der" "$CIKTI" 'dizin yok'

# ---------------------------------------------------------------------------
echo "-- (d) yas"
D="$T/d/.next/cache/images"
varyant "$D" eski1 4 $((40 * 1440))
varyant "$D" eski2 4 $((31 * 1440 + 60))
varyant "$D" taze1 4 $((29 * 1440))
varyant "$D" taze2 4 5
kos "$D" 1024 30
ok "(d) cikis 0" "$KOD" 0
ok "(d) 30 gunden eski 2 varyant silindi" "$([ -e "$D/eski1" ] || [ -e "$D/eski2" ] && echo var || echo yok)" yok
ok "(d) taze 2 varyant duruyor" "$(dosya_sayisi "$D")" 2
icerir "(d) ozet: yas_silinen=2" "$CIKTI" 'yas_silinen=2 '
icerir "(d) ozet: boyut_silinen=0 (sinir altinda)" "$CIKTI" 'boyut_silinen=0 '
ok "(d) kok dizin duruyor" "$([ -d "$D" ] && echo var)" var

# ---------------------------------------------------------------------------
echo "-- (e) boyut siniri — en eskiden baslanir, %80'e inilir"
D="$T/e/.next/cache/images"
# 20 varyant × 200 KB = 4000 KB; v01 en eski (20 dk), v20 en yeni (1 dk)
for i in $(seq 1 20); do
  varyant "$D" "$(printf 'v%02d' "$i")" 200 $((21 - i))
done
kos "$D" 2 30
ok "(e) cikis 0" "$KOD" 0
kalan_kb=$(du -sk "$D" | cut -f1)
ok "(e) sonra ≤ sinirin %80'i (1638 KB)" "$([ "$kalan_kb" -le 1638 ] && echo evet || echo "hayir: $kalan_kb")" evet
ok "(e) gereksiz silme yok (≥ %80 - 1 varyant)" "$([ "$kalan_kb" -gt $((1638 - 200 - 16)) ] && echo evet || echo "hayir: $kalan_kb")" evet
ok "(e) en eski (v01) silindi" "$([ -e "$D/v01" ] && echo var || echo yok)" yok
ok "(e) en yeni (v20) duruyor" "$([ -e "$D/v20" ] && echo var || echo yok)" var
# Silinenler bir onek olmali: hic 'kalan' en eski silinenden daha eski olamaz
ilk_kalan=$(ls "$D" | sort | head -1)
son_silinen_yok=1
for i in $(seq 1 20); do
  ad=$(printf 'v%02d' "$i")
  if [ "$ad" \< "$ilk_kalan" ] && [ -e "$D/$ad" ]; then son_silinen_yok=0; fi
  if [ ! "$ad" \< "$ilk_kalan" ] && [ ! -e "$D/$ad" ]; then son_silinen_yok=0; fi
done
ok "(e) silinenler TAM OLARAK en eskiler (arada delik yok)" "$son_silinen_yok" 1
ok "(e) bosalan varyant dizinleri temizlendi" "$(find "$D" -mindepth 1 -maxdepth 1 -type d -empty | wc -l | tr -d ' ')" 0
icerir "(e) ozet: boyut_silinen>0" "$CIKTI" 'boyut_silinen=[1-9]'

# ---------------------------------------------------------------------------
echo "-- (f) sinir altinda boyut silmesi YOK"
D="$T/f/.next/cache/images"
for i in $(seq 1 5); do varyant "$D" "k$i" 100 "$i"; done
kos "$D" 1 30
ok "(f) 5 × 100 KB < 1 MB → hepsi duruyor" "$(dosya_sayisi "$D")" 5

# ---------------------------------------------------------------------------
echo "-- (g) kapsam"
K="$T/g/.next/cache"
D="$K/images"
varyant "$D" eski 4 $((60 * 1440))
mkdir -p "$K/fetch-cache"
head -c 4096 /dev/zero > "$K/fetch-cache/kayit"
touch -d "400 days ago" "$K/fetch-cache/kayit"
head -c 4096 /dev/zero > "$D/kokte-dosya"
touch -d "400 days ago" "$D/kokte-dosya"
kos "$D/" 1024 30
ok "(g) sonda egik cizgi kabul (cikis 0)" "$KOD" 0
ok "(g) eski varyant silindi" "$([ -e "$D/eski" ] && echo var || echo yok)" yok
ok "(g) kardes fetch-cache DOKUNULMADI" "$([ -e "$K/fetch-cache/kayit" ] && echo var || echo yok)" var
ok "(g) 1. derinlikteki dosya DOKUNULMADI" "$([ -e "$D/kokte-dosya" ] && echo var || echo yok)" var

# ---------------------------------------------------------------------------
echo "-- (h) ozet satiri"
icerir "(h) tek satir, alanlar tam" "$CIKTI" '^gorsel-onbellek: [0-9-]+ [0-9:]+ once_kb=[0-9]+ sonra_kb=[0-9]+ yas_silinen=[0-9]+ boyut_silinen=[0-9]+ sinir_mb=1024 yas_gun=30$'

echo
echo "SONUC: $PASS gecti, $FAIL kaldi"
[ "$FAIL" = 0 ] || exit 1
