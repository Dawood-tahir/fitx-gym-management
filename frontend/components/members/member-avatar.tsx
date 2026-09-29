/* eslint-disable @next/next/no-img-element */
import { cn, initials } from "@/lib/utils";
import type { Member } from "@/types/api";

export function MemberAvatar({
  member,
  size = "sm",
  className,
}: {
  member: Pick<Member, "fullName" | "profilePhotoUrl">;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-primary to-primary-hover font-black text-[#04200f]",
        size === "lg" ? "size-16 rounded-2xl text-lg sm:size-20" : "size-10 rounded-xl text-xs",
        className,
      )}
      aria-label={`${member.fullName} profile picture`}
    >
      {member.profilePhotoUrl ? (
        <img src={member.profilePhotoUrl} alt="" className="size-full object-cover" />
      ) : (
        initials(member.fullName)
      )}
    </span>
  );
}
