"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Kopyalanabilir hazır metin (Kurulum Durumu, custom domain penceresi).
 *
 * navigator.clipboard yalnız GÜVENLİ bağlamda (https / localhost) var —
 * lokal http://*.lvh.me:3000'de undefined, writeText çağrısı fırlatır.
 * O durumda metin SEÇİLİR ve kişi Ctrl+C ile kopyalar.
 *
 * perLine: her satır ayrı kopyalanır — Supabase Dashboard'da her Redirect URL
 * ayrı alana girilir, iki satırı birlikte yapıştırmak işe yaramaz.
 */

function selectContents(el: HTMLElement | null) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function CopyButton({ text, onFail }: { text: string; onFail: () => void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      onFail();
      toast("Kopyalanamadı — metin seçildi, Ctrl+C ile kopyalayın.", { icon: "ℹ️" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Kopyalandı" : "Kopyala"}
    </button>
  );
}

interface CopyBlockProps {
  title: string;
  text: string;
  note?: string | null;
  perLine?: boolean;
}

export default function CopyBlock({ title, text, note, perLine = false }: CopyBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const lineRefs = useRef<Array<HTMLElement | null>>([]);

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-2 bg-bg-light px-3 py-1.5">
        <p className="min-w-0 break-words text-xs font-medium text-text-dark">{title}</p>
        {!perLine && <CopyButton text={text} onFail={() => selectContents(preRef.current)} />}
      </div>
      {note && <p className="px-3 pt-2 text-xs text-text-muted">{note}</p>}
      {perLine ? (
        <ul className="divide-y divide-border">
          {text.split("\n").map((line, i) => (
            <li key={`${i}-${line}`} className="flex items-center gap-2 px-3 py-1.5">
              <code
                ref={(el) => {
                  lineRefs.current[i] = el;
                }}
                className="min-w-0 flex-1 break-all font-mono text-xs text-text-dark"
              >
                {line}
              </code>
              <CopyButton text={line} onFail={() => selectContents(lineRefs.current[i])} />
            </li>
          ))}
        </ul>
      ) : (
        <pre
          ref={preRef}
          className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed text-text-dark"
        >
          {text}
        </pre>
      )}
    </div>
  );
}
