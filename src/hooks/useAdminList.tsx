"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { PAGE_SIZE } from "@/lib/constants";
import {
  PAGE_PARAM,
  buildListHref,
  lastPage,
  pageOverflowTarget,
  parsePageParam,
  rangeFor,
} from "@/lib/admin-list";

// Sayfalarin tek yerden almasi icin yeniden disa aktarilir.
export { PAGE_PARAM } from "@/lib/admin-list";

/**
 * ADMIN LISTE HOOK'U — sayfalama + sunucu tarafi arama + sayac (b1).
 *
 * NEDEN VAR (b1 teshisi, 18 Eylul 2026): panel listeleri `select("*")` ile
 * TUM satirlari cekiyordu. Yerel PG 18.3'te olculdu (2.000 haberli kurum):
 *
 *   | Sorgu                                  | Sure      | JSON govde |
 *   | ONCE  (select(*), LIMIT yok)           | 14.664 ms |   13 MB    |
 *   | SONRA (kolon listesi + count + LIMIT)  | 15.564 ms |  5.801 B   |
 *
 * 🔴 DIKKAT — SURE DUZELMIYOR, AG YUKU DUZELIYOR (2.300x). Sebep: numarali
 * arayuz toplam sayi ister, `count:"exact"` (count(*) OVER ()) filtreye uyan
 * TUM satirlari okumak zorundadir. Bu bilincli bir takas; count'suz olsaydi
 * ayni sorgu 0.266 ms / 23 buffer olurdu. Ayrintisi ve esigi asagida.
 *
 * Bugunku canli hacimde (9 haber) bile ag kazanci var: 55 kB -> 1.771 B,
 * cunku `news.content` (ort. 6 kB HTML) listede gosterilmedigi halde
 * cekiliyordu.
 *
 * RLS de buna bagli: policy `USING (user_has_tenant_access(tenant_id))` ve
 * argumani bir KOLON oldugu icin planner cagriyi disari cikaramaz — satir
 * basina calisir. Ayni sorgu `service_role` (BYPASSRLS) ile 1.342 ms / 97
 * buffer, `authenticated` ile 13.422 ms / 2.230 buffer. LIMIT 20 cagri
 * sayisini 2.000'den 20'ye indirir: 0.171 ms / 23 buffer.
 *
 * KARARLAR (hepsi olcumle — ayrintisi NOTE.md "b1 UYGULAMASI"):
 *   - Sayfa boyutu 20 (PAGE_SIZE.ADMIN_TABLE, zaten vardi).
 *   - `count: "exact"` KULLANILIYOR. O(n)'dir ama kurum BASINA olceklenir:
 *     500 satirda 6.191 ms, 2.000'de 16.363 ms, 20.000'de 150.387 ms.
 *     Gercekci hacimde ag RTT'sinin altinda gurultu.
 *     🔴 ESIK: bir kurum ~5.000 satiri gecerse count ve offset birlikte
 *     yeniden degerlendirilmeli (keyset + "Daha fazla yukle").
 *     `count: "planned"` DENENDI ve ELENDI: gercek 2.000 iken planner 1.667
 *     dedi (%17 sapma) — "100 sayfa" yerine "83 sayfa" yazardi.
 *   - OFFSET (`.range()`), keyset degil. Keyset derin sayfada 300x hizli
 *     (20.000 satir/500. sayfa: 64.690 ms -> 0.198 ms) ama numarali arayuzu
 *     imkansiz kilar ve `created_at` esitliginde `id` tiebreaker ister.
 *     Admin sig gezer (1-3. sayfa) ya da arar.
 *
 * ARAMA: zaten sunucudaydi (`ilike`), degisen tek sey DEBOUNCE. Not:
 * `ILIKE '%...%'` index kullanamaz, LIMIT arama sorgusunu DB tarafinda
 * duzeltmez (15.476 ms -> 14.469 ms, %7). Kazanc ag tarafinda. Kalici cozum
 * trigram index — NOTE.md backlog'unda ayri madde.
 */

/** Arama debounce suresi. 300 ms: tus vurusu arasi tipik duraklama. */
export const ADMIN_LIST_SEARCH_DEBOUNCE_MS = 300;

/**
 * Detay sayfasindan liste sayfasina donerken bulunulan sayfayi korur (b1).
 *
 * `useSearchParams` BILEREK kullanilmiyor: bu yardimci yalnizca olay
 * isleyicilerinde (kaydet) ve mount sonrasi efektlerde ("kayit bulunamadi")
 * cagriliyor — render sirasinda ASLA. Boylece 608/530/353 satirlik detay
 * sayfalarini <Suspense> ile sarmalamak gerekmiyor; prerender asamasinda bu
 * kod hic calismaz, `next build` bailout uretmez.
 */
export function listHrefWithPage(basePath: string): string {
  if (typeof window === "undefined") return basePath;
  const raw = new URLSearchParams(window.location.search).get(PAGE_PARAM);
  return buildListHref(basePath, "", parsePageParam(raw));
}

export interface UseAdminListOptions {
  /** Supabase tablo adi, orn. "news". */
  table: string;
  /**
   * Cekilecek kolonlar — `*` KULLANMAYIN.
   *
   * ⚠️ Listede GOSTERILMEYEN ama koda lazim olan kolonlar da yazilmali:
   * silme akisi `cover_image`'i storage temizligi icin okur. Eksik birakmak
   * sessizce yetim dosya birakir.
   */
  columns: string;
  /** Siralama. Panelin mevcut davranisi korunur (genelde created_at DESC). */
  order: { column: string; ascending?: boolean };
  /** Arama yapilacak kolon (ilike). Verilmezse arama kutusu calismaz. */
  searchColumn?: string;
  /**
   * Ek esitlik filtreleri, orn. `{ is_published: true }`.
   * Her render'da yeni nesne verilebilir — iceride JSON anahtarina cevrilir.
   */
  filters?: Record<string, string | number | boolean>;
  /** Varsayilan PAGE_SIZE.ADMIN_TABLE (20). */
  pageSize?: number;
}

export interface UseAdminListResult<T> {
  items: T[];
  loading: boolean;
  /** Fetch HATASI. Bos listeyle karistirilmamali — bkz. ListLoadError. */
  loadFailed: boolean;
  /** Filtre/aramaya uyan TOPLAM kayit (sayfadaki degil). */
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  /** Arama kutusunun anlik degeri (debounce ONCESI). */
  search: string;
  setSearch: (value: string) => void;
  /** Kullanici yazdi ama sorgu henuz atilmadi — arama kutusunda gosterge icin. */
  searching: boolean;
  /** Sayfa degistir. Gecmise YAZILIR (geri tusu onceki sayfaya doner). */
  goToPage: (page: number) => void;
  /** Mevcut sayfayi yeniden cek (silme sonrasi). */
  refetch: () => void;
}

export function useAdminList<T>({
  table,
  columns,
  order,
  searchColumn,
  filters,
  pageSize = PAGE_SIZE.ADMIN_TABLE,
}: UseAdminListOptions): UseAdminListResult<T> {
  const { tenant } = useTenant();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Filtre nesnesi her render'da yenilenebilir; deps icin kararli anahtar.
  const filtersKey = JSON.stringify(filters ?? {});

  // URL -> sayfa. Cop deger ("abc", "0", "-5") 1'e duser (parsePageParam).
  const page = parsePageParam(searchParams.get(PAGE_PARAM));

  /**
   * ⚠️ Bilerek NESNE degil STRING'e bagli.
   *
   * `buildHref` -> `replacePage` -> `fetchPage` -> veri cekme efekti seklinde
   * bir bagimlilik zinciri var. `searchParams` NESNESINI dep olarak vermek,
   * kimligi her render'da degisirse SONSUZ SORGU DONGUSU uretir. Metinsel
   * degere baglayinca zincirin tamami deger-tabanli olur: ayni URL ->
   * ayni string -> ayni referans -> efekt tekrar kosmaz.
   */
  const searchParamsString = searchParams.toString();

  const buildHref = useCallback(
    (target: number) => buildListHref(pathname, searchParamsString, target),
    [pathname, searchParamsString]
  );

  const goToPage = useCallback(
    (target: number) => router.push(buildHref(target)),
    [router, buildHref]
  );

  // Gecmise YAZMAYAN sayfa degisimi: arama sifirlama ve tasma duzeltmesi
  // geri tusuna cop girdi birakmamali.
  const replacePage = useCallback(
    (target: number) => router.replace(buildHref(target), { scroll: false }),
    [router, buildHref]
  );

  // --- Arama debounce ---------------------------------------------------
  // Eskiden DataTable'in her onChange'i dogrudan sorgu atiyordu: "toplanti"
  // yazmak 8 tam tarama demekti (her biri ~15 ms + ag).
  useEffect(() => {
    if (search === debouncedSearch) return;
    const timer = setTimeout(
      () => setDebouncedSearch(search),
      ADMIN_LIST_SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  // --- Arama/filtre degisince 1. sayfaya don ----------------------------
  // 5. sayfadayken arama yazip 3 sonuc bulan kullanici bos ekran gormemeli.
  // Ilk kosumda ATLANIR: URL'den gelen ?sayfa=N ezilmesin.
  const skipReset = useRef(true);
  useEffect(() => {
    if (skipReset.current) {
      skipReset.current = false;
      return;
    }
    replacePage(1);
    // replacePage her render'da degisebilir (searchParams'a bagli); bu efekt
    // YALNIZ arama/filtre degisiminde calismali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filtersKey]);

  // --- Veri cekme -------------------------------------------------------
  // Yaris korumasi: hizli yazarken/sayfa degistirirken gec donen eski cevap
  // yenisini ezmemeli.
  const requestId = useRef(0);

  const fetchPage = useCallback(async () => {
    if (!tenant) return;
    const myRequest = ++requestId.current;

    const supabase = createClient();
    const { from, to } = rangeFor(page, pageSize);

    let query = supabase
      .from(table)
      .select(columns, { count: "exact" })
      .eq("tenant_id", tenant.id);

    const activeFilters = JSON.parse(filtersKey) as Record<
      string,
      string | number | boolean
    >;
    for (const [key, value] of Object.entries(activeFilters)) {
      query = query.eq(key, value);
    }

    if (debouncedSearch && searchColumn) {
      query = query.ilike(searchColumn, `%${debouncedSearch}%`);
    }

    const { data, error, count } = await query
      .order(order.column, { ascending: order.ascending ?? false })
      .range(from, to);

    if (myRequest !== requestId.current) return; // eskimis cevap

    if (error) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }

    const toplam = count ?? 0;

    // Sayfa tasmasi: sayfanin SON satiri silindiginde ya da ?sayfa=999
    // yazildiginda bos tabloya bakilmamali — son gecerli sayfaya in.
    // Hedef her zaman `page`'ten KUCUK oldugu icin dongu olusmaz.
    const tasma = pageOverflowTarget(page, toplam, pageSize);
    if (tasma !== null) {
      replacePage(tasma);
      return;
    }

    setLoadFailed(false);
    setItems((data as unknown as T[]) ?? []);
    setTotal(toplam);
    setLoading(false);
  }, [
    tenant,
    table,
    columns,
    filtersKey,
    debouncedSearch,
    searchColumn,
    order.column,
    order.ascending,
    page,
    pageSize,
    replacePage,
  ]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const totalPages = useMemo(() => lastPage(total, pageSize), [total, pageSize]);

  return {
    items,
    loading,
    loadFailed,
    total,
    page,
    totalPages,
    pageSize,
    search,
    setSearch,
    searching: search !== debouncedSearch,
    goToPage,
    refetch: fetchPage,
  };
}
