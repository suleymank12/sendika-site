"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Newspaper, Megaphone } from "lucide-react";
import { News, Announcement } from "@/types";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface NewsAnnouncementTabsProps {
  news: News[];
  announcements: Announcement[];
}

type TabKey = "announcements" | "news";

export default function NewsAnnouncementTabs({ news, announcements }: NewsAnnouncementTabsProps) {
  const [tab, setTab] = useState<TabKey>("news");

  return (
    <div className="flex flex-col h-[350px] lg:h-[450px] rounded-xl border border-border bg-white overflow-hidden">
      {/* Tab header */}
      <div className="flex shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => setTab("news")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors",
            tab === "news"
              ? "bg-primary text-white"
              : "bg-bg-light text-text-dark hover:bg-border/50"
          )}
        >
          <Newspaper className="h-4 w-4" />
          Haberler
        </button>
        <button
          type="button"
          onClick={() => setTab("announcements")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-colors",
            tab === "announcements"
              ? "bg-primary text-white"
              : "bg-bg-light text-text-dark hover:bg-border/50"
          )}
        >
          <Megaphone className="h-4 w-4" />
          Duyurular
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "announcements" ? (
          announcements.length === 0 ? (
            <div className="h-full flex items-center justify-center p-6 text-center">
              <div className="text-text-muted text-sm">
                <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Henüz duyuru bulunmuyor.
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {announcements.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/duyurular/${a.slug}`}
                    className="group block px-4 py-3 hover:bg-bg-light transition-colors"
                  >
                    <time className="text-xs text-text-muted">
                      {formatDate(a.published_at || a.created_at)}
                    </time>
                    <p className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2 mt-0.5">
                      {a.title}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : news.length === 0 ? (
          <div className="h-full flex items-center justify-center p-6 text-center">
            <div className="text-text-muted text-sm">
              <Newspaper className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Henüz haber bulunmuyor.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {news.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/haberler/${n.slug}`}
                  className="group flex items-start gap-3 px-4 py-3 hover:bg-bg-light transition-colors"
                >
                  <div className="w-16 h-12 shrink-0 rounded-lg overflow-hidden bg-primary/5 flex items-center justify-center">
                    {n.cover_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={n.cover_image}
                        alt={n.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Newspaper className="h-6 w-6 text-primary/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <time className="text-xs text-text-muted">
                      {formatDate(n.published_at || n.created_at)}
                    </time>
                    <p className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2 mt-0.5">
                      {n.title}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer link */}
      <div className="shrink-0 border-t border-border">
        <Link
          href={tab === "announcements" ? "/duyurular" : "/haberler"}
          className="flex items-center justify-center gap-1 py-3 text-sm font-medium text-primary hover:bg-bg-light transition-colors"
        >
          Tümünü Gör
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
