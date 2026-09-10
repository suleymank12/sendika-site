"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  HelpCircle,
  Info,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import Button from "@/components/ui/Button";
import CopyBlock from "@/components/super-admin/CopyBlock";
import { cn, formatDateTime } from "@/lib/utils";
import {
  SETUP_CHECK_API_PATH,
  STATUS_LABELS,
  buildSnippets,
  evaluateSetup,
  summarizeSetup,
  type CheckItem,
  type CheckStatus,
  type SetupProbeReport,
  type SetupSnapshot,
  type Snippet,
  type SnippetId,
  type SummaryTone,
} from "@/lib/super-admin/setup-checklist";

/**
 * Kurulum Durumu — tenants/[id] sayfasının üstünde (11 Eylül 2026).
 *
 * Onay kutusu YOK: her madde her açılışta yeniden ölçülür (DB/Auth + canlı
 * yoklama, bkz. lib/super-admin/setup-checklist). İki istek paralel:
 * anlık durum (hızlı) ve canlı yoklamalar (≈ 5 sn) — sayfa yoklamayı beklemez.
 * Eksik varsa bölüm kendiliğinden açılır; kişi elle açıp kapattıysa ona uyulur.
 */

const STATUS_STYLES: Record<
  CheckStatus,
  { icon: typeof CheckCircle2; iconClass: string; badgeClass: string }
> = {
  ok: { icon: CheckCircle2, iconClass: "text-success", badgeClass: "bg-success/10 text-success" },
  missing: { icon: XCircle, iconClass: "text-error", badgeClass: "bg-error/10 text-error" },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-warning",
    badgeClass: "bg-warning/10 text-warning",
  },
  info: { icon: Info, iconClass: "text-text-muted", badgeClass: "bg-bg-light text-text-muted" },
  unknown: {
    icon: HelpCircle,
    iconClass: "text-text-muted",
    badgeClass: "bg-bg-light text-text-muted",
  },
  pending: {
    icon: Loader2,
    iconClass: "text-text-muted animate-spin",
    badgeClass: "bg-bg-light text-text-muted",
  },
};

const TONE_STYLES: Record<SummaryTone, string> = {
  ok: "bg-success/10 text-success",
  missing: "bg-error/10 text-error",
  warning: "bg-warning/10 text-warning",
  pending: "bg-bg-light text-text-muted",
};

interface SetupChecklistProps {
  tenantId: string;
  /** Artınca her şey yeniden okunur ve yoklanır (ör. kayıttan sonra). */
  refreshKey: number;
}

export default function SetupChecklist({ tenantId, refreshKey }: SetupChecklistProps) {
  // undefined = yükleniyor; null = okunamadı
  const [snapshot, setSnapshot] = useState<SetupSnapshot | null | undefined>(undefined);
  const [probes, setProbes] = useState<SetupProbeReport | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null = kişi henüz dokunmadı (otomatik); true/false = kişinin seçimi
  const [expanded, setExpanded] = useState<boolean | null>(null);
  // Hazır metin görünürlüğü: Eksik maddelerde varsayılan AÇIK, diğerlerinde
  // kapalı; bu küme varsayılanın TERSİNE çevrilen maddeleri tutar.
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  const [manualRun, setManualRun] = useState(0);
  const runId = useRef(0);

  useEffect(() => {
    const id = ++runId.current;
    const base = `${SETUP_CHECK_API_PATH}?tenantId=${encodeURIComponent(tenantId)}`;
    setProbes(undefined);
    setLoadError(null);

    fetch(base, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (id !== runId.current) return;
        if (!res.ok || !data?.snapshot) {
          setLoadError(data?.error || "Kurulum durumu okunamadı.");
          setSnapshot(null);
          return;
        }
        setSnapshot(data.snapshot as SetupSnapshot);
      })
      .catch(() => {
        if (id !== runId.current) return;
        setLoadError("Kurulum durumu okunamadı.");
        setSnapshot(null);
      });

    fetch(`${base}&probe=1`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (id !== runId.current) return;
        setProbes(res.ok && data?.probes ? (data.probes as SetupProbeReport) : null);
      })
      .catch(() => {
        if (id === runId.current) setProbes(null);
      });
  }, [tenantId, refreshKey, manualRun]);

  const evaluation = useMemo(
    () => (snapshot ? evaluateSetup({ snapshot, probes, now: Date.now() }) : null),
    [snapshot, probes]
  );
  const snippets = useMemo(() => {
    if (!snapshot) return null;
    const serverIp =
      probes && probes.server.ipv4.ok ? (probes.server.ipv4.addresses[0] ?? null) : null;
    return buildSnippets(snapshot, serverIp);
  }, [snapshot, probes]);

  // Eksik görülünce bir kez açılır ve açık KALIR (yeniden kontrolde maddeler
  // "Kontrol ediliyor"a dönünce kapanıp açılıp zıplamasın).
  const hasMissing = (evaluation?.counts.missing ?? 0) > 0;
  useEffect(() => {
    if (expanded === null && hasMissing) setExpanded(true);
  }, [expanded, hasMissing]);
  const isOpen = expanded === true;

  const summary = evaluation ? summarizeSetup(evaluation.counts) : null;
  const probing = probes === undefined;

  const toggleSnippets = (itemId: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  return (
    <div className="rounded-xl bg-white border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-5 py-4 text-left lg:px-6"
      >
        <ClipboardCheck className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-text-dark">Kurulum Durumu</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Yeni kurum için yapılması gerekenler — her açılışta canlı ölçülür.
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            summary ? TONE_STYLES[summary.tone] : loadError ? TONE_STYLES.missing : TONE_STYLES.pending
          )}
        >
          {summary ? summary.text : loadError ? "Okunamadı" : "Yükleniyor…"}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-text-muted transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-border px-5 py-4 lg:px-6">
          {loadError && <p className="text-sm text-error">{loadError}</p>}

          {evaluation?.groups.map((group) => (
            <section key={group.id} className="space-y-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {group.title}
                </p>
                {group.note && <p className="mt-0.5 text-xs text-text-muted">{group.note}</p>}
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {group.items.map((it) => (
                  <ChecklistRow
                    key={it.id}
                    item={it}
                    snippets={snippets}
                    open={toggled.has(it.id) !== (it.status === "missing")}
                    onToggle={() => toggleSnippets(it.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs text-text-muted">
              {probes
                ? `Son canlı kontrol: ${formatDateTime(probes.checkedAt)}`
                : probing
                  ? "Canlı kontrol sürüyor…"
                  : "Canlı kontrol yapılamadı."}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setManualRun((n) => n + 1)}
              loading={probing}
            >
              {!probing && <RefreshCw className="h-3.5 w-3.5" />}
              Yeniden kontrol et
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({
  item,
  snippets,
  open,
  onToggle,
}: {
  item: CheckItem;
  snippets: Record<SnippetId, Snippet | null> | null;
  open: boolean;
  onToggle: () => void;
}) {
  const style = STATUS_STYLES[item.status];
  const Icon = style.icon;
  const available = item.snippets
    .map((id) => snippets?.[id] ?? null)
    .filter((s): s is Snippet => s !== null);

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-text-dark">{item.label}</p>
            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", style.badgeClass)}>
              {STATUS_LABELS[item.status]}
            </span>
          </div>
          <p className="break-words text-xs text-text-muted">{item.detail}</p>
          {available.length > 0 && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="text-xs font-medium text-primary hover:underline"
            >
              {open ? "Hazır metni gizle" : "Hazır metni göster"}
            </button>
          )}
          {open && available.length > 0 && (
            <div className="space-y-2 pt-1">
              {available.map((s) => (
                <CopyBlock
                  key={s.id}
                  title={s.title}
                  note={s.note}
                  text={s.text}
                  perLine={s.perLine}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
