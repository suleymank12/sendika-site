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

  // Sekme kapatma / yenileme / harici URL — yalniz kirliyken dinlenir.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Eski tarayicilar returnValue ister; metin tarayici tarafindan yoksayilir.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const value = useMemo(() => ({ setDirty, confirmLeave }), [setDirty, confirmLeave]);

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
