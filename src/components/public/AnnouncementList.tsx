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
          className="group flex items-center gap-5 py-4 px-4 -mx-4 rounded-lg hover:bg-bg-light transition-colors"
        >
          <div className="shrink-0">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Calendar className="h-4 w-4" />
              <time>{formatDate(item.published_at || item.created_at)}</time>
            </div>
          </div>
          <h4 className="flex-1 text-base font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-1">
            {item.title}
          </h4>
          <ChevronRight className="h-5 w-5 text-text-muted/40 group-hover:text-primary shrink-0 transition-colors" />
        </Link>
      ))}
    </div>
  );
}
