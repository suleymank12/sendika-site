import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  published: boolean;
}

export default function StatusBadge({ published }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        published
          ? "bg-success/10 text-success"
          : "bg-warning/10 text-warning"
      )}
    >
      {published ? "Yayında" : "Taslak"}
    </span>
  );
}
