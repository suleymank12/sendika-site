"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseDialogA11yOptions {
  isOpen: boolean;
  /**
   * Esc'e basilinca cagrilir. VERILMEZSE Esc dinlenmez — bu bilerek
   * opsiyonel: form iceren modallarda Esc dolu formu tek tusla
   * kaybettirmemeli (Tur 3 b2'deki closeOnOverlay karariyla ayni eksen;
   * ui/Modal yalnizca closeOnOverlay=true iken gecirir).
   */
  onEscape?: () => void;
}

/**
 * Dialog/overlay klavye erisilebilirligi: acilista icerideki ilk
 * odaklanabilir ogeye focus tasir, kapanista (veya unmount'ta) odagi
 * tetikleyiciye geri dondurur, onEscape verildiyse Esc'i dinler.
 * Tab-wrap (tam focus trap) BILEREK yok — ayri is olarak planlandi.
 * Donen ref dialog panelinin kok elementine takilir.
 */
export default function useDialogA11y<T extends HTMLElement>({
  isOpen,
  onEscape,
}: UseDialogA11yOptions) {
  const containerRef = useRef<T>(null);

  // Tuketiciler onEscape'i cogunlukla inline arrow verir; ref uzerinden
  // okunur ki listener her render'da sokulup takilmasin.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  // Acilista focus-in, kapanista focus-restore
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    const first =
      containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first || containerRef.current)?.focus();
    return () => {
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [isOpen]);

  const hasEscape = !!onEscape;
  useEffect(() => {
    if (!isOpen || !hasEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscapeRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, hasEscape]);

  return containerRef;
}
