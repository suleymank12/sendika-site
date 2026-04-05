"use client";

import Link from "next/link";
import { QuickAccess } from "@/types";
import * as LucideIcons from "lucide-react";

interface QuickAccessGridProps {
  items: QuickAccess[];
}

function getIcon(iconName: string | null) {
  if (!iconName) return null;
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[iconName] || null;
}

export default function QuickAccessGrid({ items }: QuickAccessGridProps) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {items.map((item) => {
        const Icon = getIcon(item.icon);
        return (
          <Link
            key={item.id}
            href={item.url}
            className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-5 text-center hover:border-primary/30 hover:shadow-md transition-all"
          >
            <div className="rounded-full bg-primary/10 p-3.5 group-hover:bg-primary/20 transition-colors">
              {Icon ? (
                <Icon className="h-6 w-6 text-primary" />
              ) : (
                <LucideIcons.Zap className="h-6 w-6 text-primary" />
              )}
            </div>
            <span className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors">
              {item.title}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
