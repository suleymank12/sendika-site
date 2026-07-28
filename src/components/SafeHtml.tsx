import type { CSSProperties } from "react";
import { sanitizeContentHtml } from "@/lib/sanitize";

/**
 * Tenant admin kaynakli HTML'i render eden TEK nokta (Guvenlik bulgusu Y2).
 *
 * Bu dosya, projedeki tek mesru dangerouslySetInnerHTML kullanicisidir
 * (app/layout.tsx'teki sabit gelistirici script'i haric). .eslintrc.json'daki
 * react/no-danger kurali baska her yerde bunu HATA olarak yakalar.
 *
 * SERVER COMPONENT — "use client" YOK. sanitize-html Node-only oldugu icin
 * bu bilincli bir kisittir: HTML'i her zaman sunucuda temizleyip oyle yollariz,
 * client'a asla ham HTML gecmez.
 */
export default function SafeHtml({
  html,
  className,
  style,
}: {
  html: string | null | undefined;
  className?: string;
  style?: CSSProperties;
}) {
  const clean = sanitizeContentHtml(html);
  if (!clean) return null;

  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
