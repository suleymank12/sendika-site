"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Kaydedilmemis degisiklik korumasi (Tur 3 / b2 / P6).
 *
 * - Editor sayfalari `useDirtyTracker(isDirty)` ile kirli durumu bildirir
 *   (snapshot karsilastirmasi sayfanin kendi sorumlulugu).
 * - Sidebar / AdminHeader gecis noktalari `confirmLeave()` ile onay sorar.
 * - beforeunload yalniz kirliyken bagli: sekme kapatma / yenileme /
 *   harici URL tarayici uyarisi verir.
 *
 * BILINEN SINIR: Tarayici GERI tusu (SPA-ici popstate) korunmaz — App
 * Router'da guvenilir navigation-guard API'si yok, popstate engelleme
 * hack'i kirilgandir. Bilincli kapsam disi (NOTE.md'de kayitli).
 */

const LEAVE_MESSAGE =
  "Kaydedilmemiş değişiklikleriniz var. Sayfadan ayrılırsanız kaybolacak. Devam edilsin mi?";

interface DirtyFormContextValue {
  setDirty: (dirty: boolean) => void;
  /**
   * Temizse true doner. Kirliyse confirm sorar; kullanici onaylarsa
   * bayragi temizleyip true doner (ayni gecis ikinci kez sormasin).
   */
  confirmLeave: () => boolean;
  /**
   * Anlik kirli durum (ref'ten okunur, render tetiklemez). Oturum zaman
   * asimi (hooks/useIdleTimeout.tsx) cikistan once okur, sonra
   * setDirty(false) ile ONAY SORMADAN temizler.
   */
  isDirty: () => boolean;
}

const DirtyFormContext = createContext<DirtyFormContextValue | null>(null);

export function DirtyFormProvider({ children }: { children: React.ReactNode }) {
  // Ref: confirmLeave tuketicilerde stale-closure yasamasin diye guncel
  // degeri ref'ten okur; state yalniz beforeunload effect'ini tetiklemek icin.
  const dirtyRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
    setIsDirty(dirty);
  }, []);

  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    const ok = window.confirm(LEAVE_MESSAGE);
    if (ok) {
      dirtyRef.current = false;
      setIsDirty(false);
    }
    return ok;
  }, []);

  const isDirtyNow = useCallback(() => dirtyRef.current, []);

  // Sekme kapatma / yenileme / harici URL — yalniz kirliyken dinlenir.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      // Ref kontrolu: setDirty(false) state commit'ini beklemeden dinleyiciyi
      // etkisizlestirir. Oturum zaman asimi bayragi temizleyip AYNI adimda
      // sayfadan cikiyor; bu satir olmadan "Siteden ayrilinsin mi?"
      // diyalogu cikisi durdurabilirdi.
      if (!dirtyRef.current) return;
      e.preventDefault();
      // Eski tarayicilar returnValue ister; metin tarayici tarafindan yoksayilir.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const value = useMemo(
    () => ({ setDirty, confirmLeave, isDirty: isDirtyNow }),
    [setDirty, confirmLeave, isDirtyNow]
  );

  return <DirtyFormContext.Provider value={value}>{children}</DirtyFormContext.Provider>;
}

export function useDirtyForm(): DirtyFormContextValue {
  const ctx = useContext(DirtyFormContext);
  if (!ctx) {
    throw new Error("useDirtyForm, DirtyFormProvider icinde kullanilmali");
  }
  return ctx;
}

/**
 * Saglayicinin OLMAYABILECEGI yerler icin (SuperAdminShell'de
 * DirtyFormProvider yok): saglayici disinda null doner, hata firlatmaz.
 */
export function useOptionalDirtyForm(): DirtyFormContextValue | null {
  return useContext(DirtyFormContext);
}

/**
 * Editor sayfalari icin: hesaplanan isDirty'yi context'e yazar; sayfa
 * UNMOUNT olunca bayragi temizler (kaydet-sonrasi router.push dahil her
 * cikista sonraki sayfa kirli bayrakla aciLMAZ).
 */
export function useDirtyTracker(isDirty: boolean) {
  const { setDirty } = useDirtyForm();

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);

  useEffect(() => {
    return () => setDirty(false);
  }, [setDirty]);
}
