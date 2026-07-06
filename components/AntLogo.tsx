export default function AntLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M33 22 C 37 16, 40 14, 43 12" />
      <path d="M34 24 C 39 20, 42 19, 45 17" />
      <circle cx="33" cy="25" r="3.2" />
      <ellipse cx="24.5" cy="26" rx="4.3" ry="3.8" />
      <ellipse cx="13" cy="27" rx="7.5" ry="5.8" />
      <path d="M27 28.5 L 30 34 L 33 38" />
      <path d="M20.5 29 L 22 35 L 24.5 39.5" />
      <path d="M12 32 L 10 37 L 8 41" />
      <g transform="rotate(-12 13 16)">
        <rect x="5" y="11" width="15" height="10" rx="1.5" />
        <line x1="5" y1="16" x2="20" y2="16" />
        <line x1="12.5" y1="11" x2="12.5" y2="21" />
      </g>
    </svg>
  )
}
