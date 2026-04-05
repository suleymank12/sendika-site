import { Users } from "lucide-react";
import { BoardMember } from "@/types";

interface BoardMemberCardProps {
  member: BoardMember;
}

export default function BoardMemberCard({ member }: BoardMemberCardProps) {
  return (
    <div className="group rounded-xl border border-border bg-white overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
      <div className="relative h-56 bg-bg-light overflow-hidden">
        {member.photo ? (
          <img
            src={member.photo}
            alt={member.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Users className="h-16 w-16 text-text-muted/20" />
          </div>
        )}
      </div>
      <div className="p-4 text-center">
        <h3 className="font-semibold text-text-dark">{member.name}</h3>
        {member.title && (
          <p className="text-sm text-primary-light mt-0.5">{member.title}</p>
        )}
      </div>
    </div>
  );
}
