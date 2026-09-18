"use client";

import { Search, Edit, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Pagination from "@/components/ui/Pagination";

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

/**
 * Sunucu tarafi sayfalama bilgisi (b1). Veriyi DataTable CEKMEZ — sayfalama
 * sorguyla eslesmek zorunda oldugu icin durum `useAdminList`'te durur, buraya
 * yalnizca gosterim icin iner.
 */
export interface DataTablePagination {
  page: number;
  totalPages: number;
  /** Filtre/aramaya uyan toplam kayit. */
  total: number;
  onPageChange: (page: number) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  searchValue?: string;
  /** Kullanici yazdi, sorgu debounce'ta bekliyor → kutuda donen gosterge. */
  searching?: boolean;
  pagination?: DataTablePagination;
  actions?: boolean;
}

export default function DataTable<T extends { id: string }>({
  columns,
  data,
  onEdit,
  onDelete,
  searchPlaceholder = "Ara...",
  onSearch,
  searchValue = "",
  searching = false,
  pagination,
  actions = true,
}: DataTableProps<T>) {
  return (
    <div>
      {onSearch && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full rounded-lg border border-border pl-10 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
          {/* Debounce beklerken "takildi mi?" hissini onler (b1). */}
          {searching && (
            <Loader2
              className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted animate-spin"
              aria-hidden="true"
            />
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-light">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn("px-4 py-3 text-left font-medium text-text-muted", col.className)}
                >
                  {col.label}
                </th>
              ))}
              {actions && <th className="px-4 py-3 text-right font-medium text-text-muted w-24">İşlemler</th>}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-8 text-center text-text-muted">
                  Kayıt bulunamadı.
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-bg-light/50 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-4 py-3", col.className)}>
                      {col.render
                        ? col.render(item)
                        : (item as Record<string, unknown>)[col.key] as React.ReactNode}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(item)}
                            className="rounded-lg p-1.5 text-text-muted hover:bg-primary/10 hover:text-primary transition-colors"
                            title="Düzenle"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(item)}
                            className="rounded-lg p-1.5 text-text-muted hover:bg-error/10 hover:text-error transition-colors"
                            title="Sil"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sayfalama serisi. Pagination tek sayfada kendini gizler
          (Pagination.tsx: totalPages <= 1 → null), bu yuzden az kayitli
          kurumda yalniz "Toplam N kayit" satiri gorunur. */}
      {pagination && pagination.total > 0 && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            Toplam{" "}
            <span className="font-medium text-text-dark">{pagination.total}</span> kayıt
          </p>
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={pagination.onPageChange}
          />
        </div>
      )}
    </div>
  );
}
