export function AtlasLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Steam Atlas"
    >
      <path
        className="atlas-logo-orbit atlas-logo-orbit-a"
        d="M8 34c9-11 39-19 48-8 9 12-18 31-37 26C1 47 0 28 14 16"
      />
      <path
        className="atlas-logo-orbit atlas-logo-orbit-b"
        d="M18 53c-2-16 9-42 24-42 16 0 18 29 5 42"
      />
      <path className="atlas-logo-a" d="M19 49 31.8 14 45 49M24 37h16" />
      <circle className="atlas-logo-node" cx="14" cy="16" r="3.2" />
      <circle className="atlas-logo-core" cx="32" cy="37" r="3.5" />
    </svg>
  );
}
