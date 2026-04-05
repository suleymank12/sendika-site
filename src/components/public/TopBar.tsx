import { Phone, Mail } from "lucide-react";

interface TopBarProps {
  siteTitle: string;
  phone: string;
  email: string;
}

export default function TopBar({ siteTitle, phone, email }: TopBarProps) {
  return (
    <div className="bg-primary-dark text-white/80 text-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-white">T.C.</span>
          <span>{siteTitle}</span>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Phone className="h-3 w-3" />
              {phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
              <Mail className="h-3 w-3" />
              {email}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
