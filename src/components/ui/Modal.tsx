"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect } from "react";
import useDialogA11y from "@/hooks/useDialogA11y";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * Overlay'e (karartilmis arka plana) tiklayinca modal kapansin mi?
   *
   * VARSAYILAN false (guvenli taraf, Tur 3 b2): form iceren modallarda
   * overlay'e yanlis tiklama dolu formu tek harekette siliyordu (ornek:
   * 17 alanlik sube formu). Varsayilanin false olmasi, ileride eklenen
   * bir modalin da yanlislikla veri kaybettiren davranisa sahip
   * OLMAMASINI garanti eder. Kayip riski olmayan modallar (silme onayi,
   * salt-okunur detay) acikca true gecer.
   */
  closeOnOverlay?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  closeOnOverlay = false,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Esc, overlay tiklamasiyla ayni eksende: yalnizca kayip riski olmayan
  // (closeOnOverlay=true) modallarda kapatir — dolu form korunur (b2).
  const dialogRef = useDialogA11y<HTMLDivElement>({
    isOpen,
    onEscape: closeOnOverlay ? onClose : undefined,
  });

  if (!isOpen) return null;

  const hasCustomWidth = className && /(?:^|\s)(max-w-|w-\[)/.test(className);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={closeOnOverlay ? onClose : undefined}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 rounded-xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200",
          !hasCustomWidth && "w-full max-w-lg",
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-text-dark">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-text-muted hover:bg-bg-light hover:text-text-dark transition-colors"
              aria-label="Kapat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
