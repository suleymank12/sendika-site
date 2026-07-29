"use client";

import { AlertTriangle } from "lucide-react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ListLoadErrorProps {
  /** İlgili sayfanın fetchX fonksiyonunu (ya da retry tetikleyicisini) çağırır. */
  onRetry: () => void;
  className?: string;
}

/**
 * Liste fetch'i HATA verdiginde gosterilen ortak ekran (Tur 3 / b1 —
 * ayarlar sayfasindaki loadFailed deseninin bilesenlestirilmis hali).
 *
 * ONEMLI: Hata durumunda EmptyState ASLA gosterilmez. "Henuz kayit
 * eklenmemis" ekrani, sorgusu patlayan kullaniciya verisinin SILINDIGINI
 * dusundurur — bu bilesenin var olma nedeni o panigi onlemek. Metindeki
 * "Kayitlariniz silinmedi" cumlesi bilinclidir.
 */
export default function ListLoadError({ onRetry, className }: ListLoadErrorProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-error/30 bg-error/5 p-8 text-center",
        className
      )}
    >
      <div className="mx-auto mb-4 w-fit rounded-full bg-error/10 p-4">
        <AlertTriangle className="h-8 w-8 text-error" />
      </div>
      <h3 className="text-lg font-medium text-text-dark mb-1">Liste yüklenemedi.</h3>
      <p className="text-sm text-text-muted max-w-sm mx-auto">
        Kayıtlarınız silinmedi — bağlantı sorunu olabilir. Tekrar deneyin.
      </p>
      <Button onClick={onRetry} className="mt-4">
        Tekrar Dene
      </Button>
    </div>
  );
}
