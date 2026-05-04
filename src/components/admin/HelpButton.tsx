"use client";

import { useEffect, useState } from "react";
import {
  HelpCircle,
  X,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { getHelpTopic, HelpSection, HelpStep } from "@/lib/help-content";
import { cn } from "@/lib/utils";

interface HelpButtonProps {
  topic: string;
}

export default function HelpButton({ topic }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const help = getHelpTopic(topic);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("keydown", handleKey);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKey);
      };
    }
  }, [open]);

  useEffect(() => {
    if (open) setActiveIdx(0);
  }, [open]);

  if (!help) return null;

  const activeSection = help.sections[activeIdx];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group relative inline-flex items-center gap-2 rounded-full bg-white border border-border px-3.5 py-1.5 text-xs font-semibold text-text-dark hover:border-primary/50 hover:text-primary hover:shadow-[0_4px_14px_-4px_rgba(27,58,92,0.2)] hover:-translate-y-px active:translate-y-0 transition-all shrink-0"
        aria-label={`${help.title} sayfası için yardım`}
        title="Bu sayfa nasıl kullanılır?"
      >
        <HelpCircle className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="hidden sm:inline whitespace-nowrap tracking-tight">
          Nasıl Kullanılır?
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-10">
          <div
            className="fixed inset-0 bg-text-dark/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full max-w-5xl h-[85vh] max-h-[820px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Top header bar */}
            <div className="flex items-center justify-between gap-4 px-6 lg:px-8 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
                <HelpCircle className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider">Kullanım Rehberi</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-text-muted hover:bg-bg-light hover:text-text-dark transition-colors"
                aria-label="Kapat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Sidebar */}
              <aside className="hidden md:flex w-72 lg:w-80 shrink-0 flex-col bg-bg-light/50 border-r border-border">
                {/* Sidebar header */}
                <div className="px-6 lg:px-8 pt-8 pb-6 border-b border-border">
                  <h2 className="text-2xl font-bold text-text-dark tracking-tight mb-2">
                    {help.title}
                  </h2>
                  <p className="text-sm text-text-muted leading-relaxed">
                    {help.intro}
                  </p>
                </div>

                {/* Section navigation */}
                <nav className="flex-1 overflow-y-auto px-3 lg:px-4 py-4">
                  <p className="text-xs uppercase tracking-wider text-text-muted font-semibold px-3 mb-2">
                    Bölümler
                  </p>
                  <ul className="space-y-0.5">
                    {help.sections.map((s, i) => (
                      <li key={s.id}>
                        <button
                          onClick={() => setActiveIdx(i)}
                          className={cn(
                            "w-full text-left flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
                            activeIdx === i
                              ? "bg-white text-primary font-semibold shadow-sm border border-border"
                              : "text-text-muted hover:bg-white/60 hover:text-text-dark"
                          )}
                        >
                          <span
                            className={cn(
                              "flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold shrink-0",
                              activeIdx === i
                                ? "bg-primary text-white"
                                : "bg-border/50 text-text-muted"
                            )}
                          >
                            {i + 1}
                          </span>
                          <span className="flex-1 truncate">{s.title}</span>
                          {activeIdx === i && (
                            <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              </aside>

              {/* Mobile section nav */}
              <div className="md:hidden border-b border-border bg-white shrink-0 absolute top-[57px] left-0 right-0 z-10">
                <div className="px-4 pt-4 pb-2">
                  <h2 className="text-xl font-bold text-text-dark mb-1">
                    {help.title}
                  </h2>
                  <p className="text-sm text-text-muted leading-relaxed mb-3">
                    {help.intro}
                  </p>
                </div>
                <div className="flex items-center gap-1 px-4 overflow-x-auto pb-1">
                  {help.sections.map((s, i) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveIdx(i)}
                      className={cn(
                        "px-3 py-2 text-xs font-medium whitespace-nowrap rounded-md transition-colors shrink-0",
                        activeIdx === i
                          ? "bg-primary text-white"
                          : "text-text-muted hover:text-text-dark"
                      )}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main content */}
              <main className="flex-1 overflow-y-auto md:pt-0 pt-44">
                <div className="max-w-2xl mx-auto px-6 lg:px-12 py-10 lg:py-14">
                  <SectionView section={activeSection} />
                </div>
              </main>
            </div>

            {/* Footer pagination — desktop only */}
            {help.sections.length > 1 && (
              <div className="hidden md:flex items-center justify-between gap-4 px-6 lg:px-8 py-3 border-t border-border bg-bg-light/30 shrink-0">
                <button
                  onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                  disabled={activeIdx === 0}
                  className="text-sm font-medium text-text-muted hover:text-text-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-md hover:bg-white"
                >
                  ← Önceki
                </button>
                <p className="text-xs text-text-muted font-medium">
                  Bölüm {activeIdx + 1} / {help.sections.length}
                </p>
                <button
                  onClick={() =>
                    setActiveIdx((i) =>
                      Math.min(help.sections.length - 1, i + 1)
                    )
                  }
                  disabled={activeIdx === help.sections.length - 1}
                  className="text-sm font-semibold text-primary hover:text-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-md hover:bg-primary/5"
                >
                  Sonraki →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SectionView({ section }: { section: HelpSection }) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wider text-primary font-bold mb-2">
          Bölüm
        </p>
        <h3 className="text-3xl font-bold text-text-dark tracking-tight">
          {section.title}
        </h3>
      </div>

      {section.body && (
        <p className="text-base text-text-dark leading-loose">{section.body}</p>
      )}

      {section.steps && section.steps.length > 0 && (
        <ol className="space-y-3">
          {section.steps.map((step, i) => (
            <StepCard key={i} step={step} index={i + 1} />
          ))}
        </ol>
      )}

      {section.fields && section.fields.length > 0 && (
        <div className="space-y-2.5">
          {section.fields.map((f, i) => (
            <div
              key={i}
              className="rounded-xl border border-border p-5 hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <p className="font-semibold text-text-dark">{f.name}</p>
                {f.required && (
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-error/10 text-error font-bold">
                    Zorunlu
                  </span>
                )}
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                {f.description}
              </p>
              {f.example && (
                <p className="text-xs text-text-muted mt-3 pt-3 border-t border-border">
                  <span className="font-semibold">Örnek: </span>
                  <code className="font-mono text-text-dark bg-bg-light px-1.5 py-0.5 rounded">
                    {f.example}
                  </code>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {section.warnings && section.warnings.length > 0 && (
        <div className="rounded-xl bg-warning/[0.04] border border-warning/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <p className="text-xs font-bold uppercase tracking-wider text-warning">
              Dikkat Edilecekler
            </p>
          </div>
          <ul className="space-y-2.5">
            {section.warnings.map((w, i) => (
              <li
                key={i}
                className="text-sm text-text-dark leading-relaxed flex gap-2.5"
              >
                <span className="text-warning shrink-0 mt-1">•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {section.tips && section.tips.length > 0 && (
        <div className="rounded-xl bg-success/[0.04] border border-success/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-success" />
            <p className="text-xs font-bold uppercase tracking-wider text-success">
              İpuçları
            </p>
          </div>
          <ul className="space-y-2.5">
            {section.tips.map((t, i) => (
              <li
                key={i}
                className="text-sm text-text-dark leading-relaxed flex gap-2.5"
              >
                <span className="text-success shrink-0 mt-1">•</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StepCard({ step, index }: { step: HelpStep; index: number }) {
  return (
    <li className="flex gap-4 group">
      <div className="flex flex-col items-center shrink-0">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-xs font-bold">
          {index}
        </span>
        <span className="flex-1 w-px bg-border mt-1 group-last:hidden" />
      </div>
      <div className="flex-1 min-w-0 pb-3">
        <p className="text-base text-text-dark leading-relaxed">{step.text}</p>
        {step.outcome && (
          <div className="mt-2 flex items-start gap-2 text-sm text-text-muted">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-1" />
            <p className="leading-relaxed">{step.outcome}</p>
          </div>
        )}
      </div>
    </li>
  );
}
