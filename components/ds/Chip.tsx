import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  onRemove?: () => void
}

export default function Chip({ active = false, onRemove, className = '', children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 border-2 border-tinta shadow-hard-sm px-3 py-[10px] font-mono text-xs min-h-[44px] transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
        active ? 'bg-dorado text-tinta' : 'bg-white text-tinta'
      } ${className}`}
      {...rest}
    >
      {children}
      {onRemove && (
        <span
          role="button"
          aria-label="Quitar"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-1"
        >
          ✕
        </span>
      )}
    </button>
  )
}
