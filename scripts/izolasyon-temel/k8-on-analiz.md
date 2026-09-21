# K8 ADIM 2 — on analiz (uretec + K8 kosusundan ONCE yazildi)
yazildi: 2026-09-21T21:29:25Z

## Iddia
tahmin-uret.mjs (sha c3ecc828…, DEGISTIRILMEDI) tazelenmis temel cizgiye
(commit 4e03ef1) karsi 57 satir uretecek. K8 matrisi 58 satir uretecek.
Fark TEK satir:

    ~ html|bilinmeyen-sub|{A.manset}.konum: "{A.haber}" → null

## Neden
- Uretecte konum kurali YOK ("csp, slug, konum, tur DEGISMEZ" varsayimi).
- Tazelenmis temel cizgide bu hucre: durum 307, konum "{A.haber}" (manset
  yayindaki habere sayfa seviyesinde redirect ediyor).
- K8'de (public) layout notFound() atiyor; ilk K8 kosusu (k8/1-sonra.txt,
  00:13 yerel = 21:13Z, veri kaymasindan (20:29:29Z) SONRA, ayni veri)
  bu hucrede durum 404 verdi ve konum satiri CIKMADI → K8'de konum = null.
  Yani layout notFound'u sayfanin redirect'inden once geliyor.
- Onceki DUR raporundaki "degistirilmemis uretec yalniz eski degerleri
  degistirir" ifadesi bu satir icin YANLISTI.

## Uretec ciktisinda degismesi beklenen 3 satir (eski degerler)
    ~ html|bilinmeyen-sub|{A.manset}.durum: 307 → 404          (eskiden 200 → 404)
    ~ html|bilinmeyen-sub|{A.manset}.kurumBaslik: "?(ASFASFASFASFASF)" → "BULUNAMADI"
    ~ rsc|bilinmeyen-sub|{A.manset}.isaret: "redirect" → "notFound"
Diger 54 satir aynen.

## Sonuc
Kural 8 geregi bu satir BEKLENMEYEN sayilir → DUR, kontrol deneyi tekrari,
temel cizgi KAYDEDILMEZ, K8 commit EDILMEZ. Bu not tahmin dosyasinin yerine
GECMEZ; yalniz sapmanin onceden bilindigini kayda gecirir.
