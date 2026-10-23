export function RuneMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="rune-grad" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F7C98B" />
          <stop offset="0.55" stopColor="#F08540" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <path
        d="M24 2.5 42.4 13v22L24 45.5 5.6 35V13L24 2.5Z"
        stroke="url(#rune-grad)"
        strokeWidth="1.6"
      />
      <path d="M24 11.5 33 24l-9 12.5L15 24l9-12.5Z" stroke="url(#rune-grad)" strokeWidth="1.2" />
      <path d="M24 17.5v13M19.5 24h9" stroke="url(#rune-grad)" strokeWidth="1.2" />
      <circle cx="24" cy="24" r="2.2" fill="#F7C98B" />
    </svg>
  );
}
