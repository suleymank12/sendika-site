"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { OTURUM_ZAMAN_ASIMI } from "@/lib/constants";
import { useOptionalDirtyForm } from "@/hooks/useDirtyForm";
import {
  IDLE_ACTIVITY_EVENTS,
  IDLE_CHECK_INTERVAL_MS,
  IDLE_STORAGE_KEY,
  buildIdleLoginUrl,
  evaluateIdle,
  initialActivity,
  isCredibleStored,
  isIdleExpired,
  parseStoredActivity,
  serializeActivity,
  sessionIdFromAccessToken,
  shouldWriteActivity,
} from "@/lib/idle-timeout";

/**
 * Oturum zaman asimi (12 Eylul 2026): OTURUM_ZAMAN_ASIMI.SURE_DK dakika islem
 * yapilmazsa UYARISIZ cikis (musteri karari: geri sayim / "oturumu surdur"
 * diyalogu YOK; nedeni giris sayfasi soyler). Karar, gerekceler ve bilinen
 * sinirlar: NOTE.md "OTURUM ZAMAN ASIMI".
 *
 * - Tek saglayici: AdminShell + SuperAdminShell. Layout sayfa gecislerinde
 *   yeniden kurulmaz -> sayac kesintisiz.
 * - Etkinlik: IDLE_ACTIVITY_EVENTS + sayfa gecisi (lib/idle-timeout.ts).
 * - Kontrol: 15 sn'de bir + gorunur olunca / odakta / bfcache donusunde /
 *   baska sekme kaydi guncelleyince.
 * - useIdleHold: yukleme surerken sayac durur.
 * - Coklu sekme: localStorage'da OTURUMA BAGLI tek zaman damgasi + storage
 *   olayi; baska sekmedeki cikis auth-js'in sekmeler arasi yayinladigi
 *   SIGNED_OUT ile gelir.
 */

const TIMEOUT_MS = OTURUM_ZAMAN_ASIMI.SURE_DK * 60_000;

/**
 * SIGNED_OUT geldikten sonra yonlendirmeden once beklenen sure. Bu sekmedeki
 * ELLE cikis kendi akisiyla (signOut -> router.push) giris sayfasina gider;
 * saglayici unmount olur, zamanlayici temizlenir — elle cikis DEGISMEZ. Sayfa
 * bu surede degismediyse cikis baska sekmeden (ya da token yenileme
 * hatasindan) gelmistir -> yonlendir.
 */
const SIGNED_OUT_FOLLOW_MS = 1_500;

interface IdleTimeoutContextValue {
  /** Tutma baslatir (sayac durur); donen fonksiyon birakir. */
  acquireHold: () => () => void;
}

const IdleTimeoutContext = createContext<IdleTimeoutContextValue | null>(null);

function readStored(): string | null {
  try {
    return window.localStorage.getItem(IDLE_STORAGE_KEY);
  } catch {
    return null; // localStorage kapali olabilir (gizli mod / politika)
  }
}

function writeStored(value: string) {
  try {
    window.localStorage.setItem(IDLE_STORAGE_KEY, value);
  } catch {
    // kapali olabilir — sekme kendi sayaciyla devam eder
  }
}

function currentPath(): string {
  return window.location.pathname + window.location.search;
}

export function IdleTimeoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // SuperAdminShell'de DirtyFormProvider yok -> null.
  const dirtyForm = useOptionalDirtyForm();

  const lastActivityRef = useRef(0);
  const lastWriteRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  // Oturum cozulene kadar etkinlik SAYILMAZ ve kontrol yapilmaz.
  const readyRef = useRef(false);
  const holdsRef = useRef(0);
  const leavingRef = useRef(false);
  const signedOutAtRef = useRef(0);

  const persist = useCallback((now: number, force: boolean) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    if (!force && !shouldWriteActivity(lastWriteRef.current, now)) return;
    lastWriteRef.current = now;
    writeStored(serializeActivity(lastActivityRef.current, sessionId));
  }, []);

  const markActivity = useCallback(() => {
    // Oturum cozulmeden gelen etkinlik sayilmaz: kapatilip saatler sonra
    // acilan sekmede ilk tiklama, dolmus oturumu kurtarmasin.
    if (!readyRef.current || leavingRef.current) return;
    const now = Date.now();
    lastActivityRef.current = now;
    persist(now, false);
  }, [persist]);

  /**
   * Kirli form durumunu okur ve ONAY SORMADAN temizler: window.confirm
   * basinda kimse yokken sonsuza dek bekler, beforeunload ise tam sayfa
   * gecisi durdurur — ikisi de cikisi hic tamamlatmazdi.
   */
  const takeDirty = useCallback((): boolean => {
    const wasDirty = dirtyForm?.isDirty() ?? false;
    dirtyForm?.setDirty(false);
    return wasDirty;
  }, [dirtyForm]);

  const expire = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    // 1) Kirli bayrak
    const wasDirty = takeDirty();
    // 2) Yalniz BU oturum (scope: local): kisinin baska cihazdaki oturumu
    //    dusmez. Ag hatasinda auth-js yerel oturumu SILMEZ; sonraki
    //    yuklemede kayit yine dolmus gorunur ve cikis tekrar denenir.
    try {
      await createClient().auth.signOut({ scope: "local" });
    } catch {
      // yonlendirme yine yapilir
    }
    // 3) replace: geri tusu dolmus sayfaya donmesin.
    window.location.replace(
      buildIdleLoginUrl({ expired: true, dirty: wasDirty, next: currentPath() })
    );
  }, [takeDirty]);

  const followSignOut = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    // Paylasilan kayit dolmussa cikis zaman asimindandir (baska sekme
    // kapatti) -> ayni mesaj. Degilse elle cikis / oturum dustu -> sade giris.
    const now = Date.now();
    const stored = parseStoredActivity(readStored());
    const expired =
      isCredibleStored(stored, sessionIdRef.current, now) &&
      isIdleExpired(stored.t, now, TIMEOUT_MS);
    const wasDirty = takeDirty();
    window.location.replace(
      buildIdleLoginUrl({ expired, dirty: wasDirty, next: currentPath() })
    );
  }, [takeDirty]);

  const check = useCallback(() => {
    if (leavingRef.current) return;
    if (signedOutAtRef.current) {
      if (Date.now() - signedOutAtRef.current >= SIGNED_OUT_FOLLOW_MS) followSignOut();
      return;
    }
    if (!readyRef.current) return;
    const now = Date.now();
    const { last, expired } = evaluateIdle({
      now,
      memoryLast: lastActivityRef.current,
      stored: parseStoredActivity(readStored()),
      sessionId: sessionIdRef.current,
      holds: holdsRef.current,
      timeoutMs: TIMEOUT_MS,
    });
    lastActivityRef.current = last;
    if (expired) {
      void expire();
      return;
    }
    // Tutma surerken diger sekmeler de bu oturumu "etkin" gorsun.
    if (holdsRef.current > 0) persist(now, false);
  }, [expire, followSignOut, persist]);

  const resolveSession = useCallback(
    (sessionId: string) => {
      if (sessionIdRef.current === sessionId) return;
      sessionIdRef.current = sessionId;
      const now = Date.now();
      const { last, fresh } = initialActivity(
        parseStoredActivity(readStored()),
        sessionId,
        now
      );
      lastActivityRef.current = last;
      if (fresh) persist(now, true);
      readyRef.current = true;
      // Ayni oturumun kaydi dolmussa (kapatilip acilan sekme) burada cikar.
      check();
    },
    [check, persist]
  );

  // Oturum kimligi + baska sekmeden gelen cikis.
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let followTimer: number | undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (leavingRef.current || signedOutAtRef.current) return;
        signedOutAtRef.current = Date.now();
        followTimer = window.setTimeout(followSignOut, SIGNED_OUT_FOLLOW_MS);
        return;
      }
      // JWT cozulemezse kullaniciya bagla: sayac hicbir durumda sessizce
      // devre disi kalmasin (bedeli: eski oturumun kaydi yeni girisi atabilir).
      const sessionId =
        sessionIdFromAccessToken(session?.access_token) ??
        (session?.user?.id ? `u:${session.user.id}` : null);
      if (!sessionId) return;
      // Callback icinde auth metodu cagirmak kilitlenebilir (Supabase
      // uyarisi); resolveSession -> check -> signOut zinciri ERTELENIR.
      window.setTimeout(() => {
        if (active) resolveSession(sessionId);
      }, 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      if (followTimer !== undefined) window.clearTimeout(followTimer);
    };
  }, [followSignOut, resolveSession]);

  // Etkinlik olaylari.
  useEffect(() => {
    const options: AddEventListenerOptions = { capture: true, passive: true };
    for (const type of IDLE_ACTIVITY_EVENTS) {
      document.addEventListener(type, markActivity, options);
    }
    return () => {
      for (const type of IDLE_ACTIVITY_EVENTS) {
        document.removeEventListener(type, markActivity, options);
      }
    };
  }, [markActivity]);

  // Sayfa gecisi etkinliktir (ilk render'daki cagri oturum cozulmeden
  // geldigi icin sayilmaz).
  useEffect(() => {
    markActivity();
  }, [pathname, markActivity]);

  // Periyodik kontrol + aninda kontrol noktalari.
  useEffect(() => {
    const interval = window.setInterval(check, IDLE_CHECK_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    const onStorage = (e: StorageEvent) => {
      // Baska sekme kaydi guncelledi: 15 sn beklemeden yeniden degerlendir.
      if (e.key === IDLE_STORAGE_KEY) check();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      // bfcache: cikistan sonra GERI tusu sayfayi JS bellegiyle birlikte geri
      // getirebilir -> tekrar giris sayfasina.
      if (e.persisted && leavingRef.current) {
        window.location.replace("/admin/giris");
        return;
      }
      check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", check);
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [check]);

  const acquireHold = useCallback(() => {
    holdsRef.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holdsRef.current = Math.max(0, holdsRef.current - 1);
      // Is bitti: sure bu andan baslar.
      if (readyRef.current && !leavingRef.current) {
        const now = Date.now();
        lastActivityRef.current = now;
        persist(now, true);
      }
    };
  }, [persist]);

  const value = useMemo(() => ({ acquireHold }), [acquireHold]);

  return <IdleTimeoutContext.Provider value={value}>{children}</IdleTimeoutContext.Provider>;
}

/**
 * Suren is (yukleme) boyunca sayaci durdurur: 400 MB video yavas hatta
 * dakikalarca surer, kullanici dokunmadan bekler; yarida kesilen yukleme
 * yarim dosya birakir. Tutma is bitince kalkar — sure sinirli. Kaydedilmemis
 * form icin tutma YOK: o suresiz olurdu (NOTE.md). Saglayici disinda etkisiz.
 */
export function useIdleHold(active: boolean) {
  const ctx = useContext(IdleTimeoutContext);
  useEffect(() => {
    if (!active || !ctx) return;
    return ctx.acquireHold();
  }, [active, ctx]);
}
