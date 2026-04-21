"use client";

import { Printer, ZoomIn, ZoomOut } from "lucide-react";

interface ArticleToolsProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  minSize?: number;
  maxSize?: number;
}

export default function ArticleTools({
  fontSize,
  onFontSizeChange,
  minSize = 12,
  maxSize = 24,
}: ArticleToolsProps) {
  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const increase = () => {
    if (fontSize + 2 <= maxSize) onFontSizeChange(fontSize + 2);
  };

  const decrease = () => {
    if (fontSize - 2 >= minSize) onFontSizeChange(fontSize - 2);
  };

  return (
    <div className="flex gap-2 no-print">
      <button
        type="button"
        onClick={handlePrint}
        title="Yazdır"
        aria-label="Yazdır"
        className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Printer className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={increase}
        disabled={fontSize >= maxSize}
        title="Yazıyı büyüt"
        aria-label="Yazıyı büyüt"
        className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={decrease}
        disabled={fontSize <= minSize}
        title="Yazıyı küçült"
        aria-label="Yazıyı küçült"
        className="p-1 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
    </div>
  );
}
