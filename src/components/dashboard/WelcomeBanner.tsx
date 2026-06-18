import {
  userLabelClass,
  userPanelClass,
  userStatClass,
  userTitleClass,
} from "@/components/user/user-styles";

interface WelcomeBannerProps {
  name: string;
  highlight: string | number;
  highlightSuffix?: string;
}

export function WelcomeBanner({
  name,
  highlight,
  highlightSuffix,
}: WelcomeBannerProps) {
  return (
    <section
      className={`${userPanelClass} flex items-center justify-between gap-6 px-6 py-5`}
    >
      <p className={userTitleClass}>Guten Tag, {name}</p>
      <div className="shrink-0 text-right">
        <p className={userStatClass}>{highlight}</p>
        {highlightSuffix && (
          <p className={`${userLabelClass} mt-0.5`}>{highlightSuffix}</p>
        )}
      </div>
    </section>
  );
}
