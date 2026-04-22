import HeadlineSlider from "@/components/public/HeadlineSlider";
import NewsAnnouncementTabs from "@/components/public/NewsAnnouncementTabs";
import { Headline, News, Announcement, Slider } from "@/types";

interface NewsAnnouncementSectionProps {
  headlines: Headline[];
  sliders: Slider[];
  news: News[];
  announcements: Announcement[];
  variant?: "full" | "compact";
}

export default function NewsAnnouncementSection({
  headlines,
  sliders,
  news,
  announcements,
  variant = "full",
}: NewsAnnouncementSectionProps) {
  const layoutNews = news.slice(0, 5);
  const layoutAnnouncements = announcements.slice(0, 6);

  if (variant === "compact") {
    return (
      <NewsAnnouncementTabs
        news={layoutNews}
        announcements={layoutAnnouncements}
        fullHeight
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-0">
      <div className="lg:col-span-2 lg:pr-4">
        <HeadlineSlider headlines={headlines} fallbackSliders={sliders} />
      </div>
      <div className="lg:col-span-1">
        <NewsAnnouncementTabs
          news={layoutNews}
          announcements={layoutAnnouncements}
        />
      </div>
    </div>
  );
}
