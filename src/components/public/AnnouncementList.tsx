import Link from "next/link";
import { Calendar, ChevronRight } from "lucide-react";
import { Announcement } from "@/types";
import { formatDate } from "@/lib/utils";

interface AnnouncementListProps {
  announcements: Announcement[];
}

export default function AnnouncementList({ announcements }: AnnouncementListProps) {
  if (announcements.length === 0) return null;

  return (
    <div className="divide-y divide-border">
      {announcements.map((item) => (
        <Link
          key={item.id}
          href={`/duyurular/${item.slug}`}
          className="group flex items-center gap-3 py-4 px-4 -mx-4 rounded-lg hover:bg-bg-light transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <Calendar className="h-3.5 w-3.5" />
              <time>{formatDate(item.published_at || item.created_at)}</time>
            </div>
            <h4 className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2 mt-1">
              {item.title}
            </h4>
          </div>
          <ChevronRight className="h-5 w-5 text-text-muted/40 group-hover:text-primary shrink-0 transition-colors" />
        </Link>
      ))}
    </div>
  );
}
