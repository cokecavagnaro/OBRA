export default function CostiaLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Costia">
      <path
        d="M88 17 39 45c-4 2.3-6.5 6.6-6.5 11.2v18.6c0 4.7 2.5 9 6.6 11.3L88 103"
        fill="none"
        stroke="#1E5B35"
        strokeWidth={19}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="57" y="67" width="11" height="22" rx="5.5" fill="#F5C542" />
      <rect x="74" y="54" width="11" height="35" rx="5.5" fill="#F5C542" />
      <rect x="91" y="39" width="11" height="50" rx="5.5" fill="#F5C542" />
    </svg>
  )
}
