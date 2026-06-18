export function G2RatingBadge() {
  return (
    <div
      className="landing-radius-sm inline-flex items-center gap-2 bg-white/20 px-2 py-1 backdrop-blur-[20px]"
      aria-label="Kundenbewertung 4.9 von 5 Sternen"
    >
      <span className="landing-caption font-normal text-white">
        ★
      </span>
      <span className="flex items-center gap-0.5 text-white" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 0.5l1.5 3.5 3.8.3-2.9 2.5.9 3.7L6 8.6 3.7 10.5l.9-3.7L1.7 4.3l3.8-.3L6 0.5z" />
          </svg>
        ))}
      </span>
      <span className="landing-caption text-white">
        4.9
      </span>
    </div>
  );
}
