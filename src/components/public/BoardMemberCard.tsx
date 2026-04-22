import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import { BoardMember } from "@/types";

interface BoardMemberCardProps {
  member: BoardMember;
}

export default function BoardMemberCard({ member }: BoardMemberCardProps) {
  const hasDetail = !!member.slug;

  const cardContent = (
    <>
      <div className="relative h-56 bg-bg-light overflow-hidden">
        {member.photo ? (
          <Image
            src={member.photo}
            alt={member.name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Users className="h-16 w-16 text-text-muted/20" />
          </div>
        )}
      </div>
      <div className="p-4 text-center">
        <h3 className="font-semibold text-text-dark group-hover:text-primary transition-colors">
          {member.name}
        </h3>
        {member.title && (
          <p className="text-sm text-primary-light mt-0.5">{member.title}</p>
        )}
      </div>
    </>
  );

  const className =
    "group rounded-xl border border-border bg-white overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 block";

  if (hasDetail) {
    return (
      <Link href={`/yonetim-kurulu/${member.slug}`} className={className}>
        {cardContent}
      </Link>
    );
  }

  return <div className={className}>{cardContent}</div>;
}
