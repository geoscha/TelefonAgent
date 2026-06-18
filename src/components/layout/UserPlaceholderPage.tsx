import { Construction } from "lucide-react";

import { userLabelClass, userTitleClass } from "@/components/user/user-styles";

interface UserPlaceholderPageProps {
  title: string;
  description: string;
  bullets?: string[];
}

export function UserPlaceholderPage({
  title,
  description,
  bullets = [],
}: UserPlaceholderPageProps) {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded border border-[#E1E4EA] bg-[#F5F7FA] text-[#525866]">
        <Construction className="h-7 w-7 stroke-[1.5]" />
      </div>
      <h1 className={userTitleClass}>{title}</h1>
      <p className={`${userLabelClass} mt-2`}>{description}</p>
      {bullets.length > 0 && (
        <ul className={`${userLabelClass} mt-6 space-y-2 text-left`}>
          {bullets.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#335cff]" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
