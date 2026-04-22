import Link from "next/link";
import { MapPin, Phone, Mail, ChevronRight } from "lucide-react";
import { Branch } from "@/types";

interface BranchCardProps {
  branch: Branch;
}

export default function BranchCard({ branch }: BranchCardProps) {
  const hasDetail = !!branch.slug;

  const cardContent = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-text-dark group-hover:text-primary transition-colors">
          {branch.name}
        </h3>
        {hasDetail && (
          <ChevronRight className="h-4 w-4 text-text-muted shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        )}
      </div>
      {branch.city && (
        <p className="text-sm text-primary-light font-medium mt-1 mb-3">{branch.city}</p>
      )}
      <div className="space-y-2.5">
        {branch.address && (
          <div className="flex items-start gap-2 text-sm text-text-muted">
            <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-text-muted/60" />
            <span>{branch.address}</span>
          </div>
        )}
        {branch.phone && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Phone className="h-4 w-4 shrink-0 text-text-muted/60" />
            {branch.phone}
          </div>
        )}
        {branch.email && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Mail className="h-4 w-4 shrink-0 text-text-muted/60" />
            {branch.email}
          </div>
        )}
      </div>
    </>
  );

  const className =
    "group block rounded-xl border border-border bg-white p-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300";

  if (hasDetail) {
    return (
      <Link href={`/subeler/${branch.slug}`} className={className}>
        {cardContent}
      </Link>
    );
  }

  return <div className={className}>{cardContent}</div>;
}
