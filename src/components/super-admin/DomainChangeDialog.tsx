"use client";

import { AlertTriangle } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import CopyBlock from "@/components/super-admin/CopyBlock";
import type { DomainChangeNotice } from "@/lib/super-admin/setup-checklist";

/**
 * Custom domain değişince (ya da silinince) açılan yapılacaklar penceresi.
 *
 * Toast DEĞİL: birden fazla satır + kopyala butonu toast'a sığmaz, 12 sn'de
 * de kaybolur. Overlay ya da Esc ile kapanmaz (Modal varsayılanı) — "Anladım"
 * ya da X ile bilerek kapatılır. Eski domain DB'de saklanmadığı için pencere
 * kapanınca hatırlatma biter (bilinçli; NOTE.md → Kurulum Durumu).
 */
export default function DomainChangeDialog({
  notice,
  onClose,
}: {
  notice: DomainChangeNotice | null;
  onClose: () => void;
}) {
  if (!notice) return null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={notice.newDomain ? "Custom domain değişti" : "Custom domain kaldırıldı"}
      className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-4">
        <p className="text-sm text-text-dark">
          {notice.newDomain ? (
            <>
              <strong>{notice.oldDomain}</strong> → <strong>{notice.newDomain}</strong>.
            </>
          ) : (
            <>
              <strong>{notice.oldDomain}</strong> artık bu kuruma bağlı değil.
            </>
          )}{" "}
          Kod dışındaki şu adımlar elle yapılmalı:
        </p>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            1. Supabase → Authentication → URL Configuration → Redirect URLs
          </p>
          <CopyBlock
            title={`SİLİN — eski domain (${notice.oldDomain})`}
            text={notice.supabaseRemove.join("\n")}
            perLine
          />
          {notice.newDomain && notice.supabaseAdd.length > 0 && (
            <CopyBlock
              title={`EKLEYİN — yeni domain (${notice.newDomain})`}
              note="İlk satır zorunlu (şifre sıfırlama bu adrese döner), ikincisi savunma."
              text={notice.supabaseAdd.join("\n")}
              perLine
            />
          )}
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-text-dark">
              Eski satırı silmek güvenlik gereği: listede kalan domain el değiştirirse (süresi
              dolup başkası alırsa), biri o adresi kullanarak kurum adminine gerçek bir şifre
              sıfırlama maili tetikleyebilir; admin tıklarsa oturum o siteye gider.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            2. Sunucu — eski domain&apos;in Nginx blokları ve sertifikası
          </p>
          <CopyBlock title="Sunucuda, sırayla" text={notice.serverCleanup} />
        </section>

        {notice.newDomain && (
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              3. Yeni domain
            </p>
            <p className="text-xs text-text-muted">
              DNS, sertifika ve Nginx adımları hazır metinleriyle sayfanın üstündeki Kurulum
              Durumu bölümünde; bölüm yeni domain&apos;i hemen yokluyor.
            </p>
          </section>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>Anladım</Button>
        </div>
      </div>
    </Modal>
  );
}
