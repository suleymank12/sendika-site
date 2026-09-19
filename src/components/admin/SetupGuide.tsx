"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, Circle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeSetupGuide, type SetupGuideResult, type SetupStep } from "@/lib/setup-guide";

/**
 * "Başlangıç Adımları" — Özet ekranının üstündeki kurulum rehberi.
 * (19 Eylül 2026)
 *
 * TON (teşhis turu kararı): süper admindeki ❌ "Eksik" / ⚠️ "Uyarı" sözlüğü
 * BURAYA TAŞINMADI. Okuyan kişi teknik değil ve hiçbir şeyi yanlış yapmamış —
 * yalnızca siteyi henüz doldurmamış. Bu yüzden:
 *   · kırmızı yok (`text-error` kullanılmıyor), durum kelimesi yok
 *   · açık adımın metni ZİYARETÇİNİN gördüğünü anlatır ("anasayfanın üstünde
 *     şu kutu görünüyor"), admin'in yapmadığını değil
 *   · ilerleme olumlu çerçevelenir ("8 adımdan 3 tanesi tamam")
 *
 * Mantık burada DEĞİL: eşikler ve sıra lib/setup-guide.ts'te (saf, test
 * edilir). Bu dosya yalnız sunum + kapatma yazımının tetiği.
 */

interface SetupGuideProps {
  result: SetupGuideResult;
  /** Kapatma/geri açma site_settings'e yazılır — yazan taraf dashboard. */
  onDismiss: () => void;
  dismissing: boolean;
}

function StepRow({ step }: { step: SetupStep }) {
  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 py-3 border-b border-border last:border-0">
      <Circle className="h-4 w-4 shrink-0 text-text-muted hidden sm:block" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-dark">{step.label}</p>
        <p className="text-sm text-text-muted mt-0.5">{step.detail}</p>
      </div>
      <Link
        href={step.href}
        className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {step.action}
        <ChevronRight className="h-4 w-4" />
      </Link>
    </li>
  );
}

export default function SetupGuide({ result, onDismiss, dismissing }: SetupGuideProps) {
  // Tamamlananlar varsayılan KAPALI: ekranı, yapılacak işten çok yapılmış
  // işle doldurmak rehberin amacını bozar.
  const [showDone, setShowDone] = useState(false);

  // Gizlendiyse SUSAR — okunabilir olsun olmasın. Kapatmış birine, geçici
  // bir sorgu hatası yüzünden "okunamadı" satırı göstermek kapatma vaadini
  // bozardı. Geri kapısı Özet'in en altındaki bağlantı.
  if (result.dismissed) return null;

  // Okunamadı → hiçbir madde hakkında konuşma. Süper admindeki "asla sahte
  // Tamam" ilkesinin karşılığı; 6 durumlu sözlüğü getirmeden, tek satırla.
  if (!result.readable) {
    return (
      <div className="rounded-xl bg-white border border-border p-4 flex items-center gap-3">
        <Info className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
        <p className="text-sm text-text-muted">
          Kurulum durumu okunamadı. Sayfayı yenileyin.
        </p>
      </div>
    );
  }

  const { steps, doneCount, total, allDone } = result;

  // Hepsi tamam → panel tek yeşil satıra iner. Kendiliğinden kaybolmuyor:
  // adımlar BAŞKA ekranlarda tamamlanıyor, "bitti" onayının bir kez
  // görülmesi gerekiyor. Ama 8 satırın ekranda durmasının da anlamı yok.
  if (allDone) {
    return (
      <div className="rounded-xl bg-white border border-success/30 p-4 flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10">
          <Check className="h-4 w-4 text-success" aria-hidden />
        </span>
        <p className="flex-1 text-sm font-medium text-text-dark">Site kurulumu tamamlandı.</p>
        <button
          type="button"
          onClick={onDismiss}
          disabled={dismissing}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg-light hover:text-text-dark disabled:opacity-50"
        >
          Gizle
        </button>
      </div>
    );
  }

  const openSteps = steps.filter((s) => !s.done);
  const doneSteps = steps.filter((s) => s.done);
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <section className="rounded-xl bg-white border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-text-dark">Başlangıç Adımları</h2>
          <p className="text-sm text-text-muted mt-0.5">
            Siteniz yayında. Aşağıdakiler tamamlanınca ziyaretçi için de eksiksiz görünecek.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={dismissing}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-bg-light hover:text-text-dark disabled:opacity-50"
        >
          Gizle
        </button>
      </div>

      {/* İlerleme */}
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {summarizeSetupGuide(doneCount, total)}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg-light"
          role="progressbar"
          aria-valuenow={doneCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Tamamlanan başlangıç adımları"
        >
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <ul className="mt-2">
        {openSteps.map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
      </ul>

      {doneSteps.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-dark"
            aria-expanded={showDone}
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", !showDone && "-rotate-90")}
              aria-hidden
            />
            {doneSteps.length} tamamlanan adım
          </button>
          {showDone && (
            <ul className="mt-2 space-y-1.5">
              {doneSteps.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm text-text-muted">
                  <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
                  {s.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
