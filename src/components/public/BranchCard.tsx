import { MapPin, Phone, Mail } from "lucide-react";
import { Branch } from "@/types";

interface BranchCardProps {
  branch: Branch;
}

export default function BranchCard({ branch }: BranchCardProps) {
  return (
    <div className="rounded-xl border border-border bg-white p-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
      <h3 className="font-semibold text-text-dark mb-3">{branch.name}</h3>
      {branch.city && (
        <p className="text-sm text-primary-light font-medium mb-3">{branch.city}</p>
      )}
      <div className="space-y-2.5">
        {branch.address && (
          <div className="flex items-start gap-2 text-sm text-text-muted">
            <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-text-muted/60" />
            <span>{branch.address}</span>
          </div>
        )}
        {branch.phone && (
          <a href={`tel:${branch.phone}`} className="flex items-center gap-2 text-sm text-text-muted hover:text-primary transition-colors">
            <Phone className="h-4 w-4 shrink-0 text-text-muted/60" />
            {branch.phone}
          </a>
        )}
        {branch.email && (
          <a href={`mailto:${branch.email}`} className="flex items-center gap-2 text-sm text-text-muted hover:text-primary transition-colors">
            <Mail className="h-4 w-4 shrink-0 text-text-muted/60" />
            {branch.email}
          </a>
        )}
      </div>
    </div>
  );
}
