import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="bg-bg-light border-b border-border">
      <div className="container mx-auto px-4 py-3">
        <ol className="flex items-center gap-1.5 text-sm">
          <li>
            <Link href="/" className="flex items-center gap-1 text-text-muted hover:text-primary transition-colors">
              <Home className="h-3.5 w-3.5" />
              <span>Anasayfa</span>
            </Link>
          </li>
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-text-muted/50" />
              {item.href ? (
                <Link href={item.href} className="text-text-muted hover:text-primary transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className="text-text-dark font-medium">{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
