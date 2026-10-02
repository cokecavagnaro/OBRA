import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  fullWidth?: boolean
}

const base =
  'inline-flex items-center justify-center gap-2 border-2 border-tinta font-mono font-bold transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-hard-active disabled:opacity-50 disabled:pointer-events-none min-h-[44px] px-5 py-[18px] text-base'

const variants: Record<NonNullable<Props['variant']>, string> = {
  primary: 'bg-dorado text-tinta shadow-hard',
  secondary: 'bg-white text-tinta shadow-hard',
}

export default function Button({ variant = 'primary', fullWidth = true, className = '', ...rest }: Props) {
  return (
    <button
      className={`${base} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  )
}
