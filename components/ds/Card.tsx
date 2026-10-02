import type { HTMLAttributes } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  shadow?: 'hard-sm' | 'hard' | 'hard-md' | 'hard-lg' | 'hard-xl'
}

const shadowClass: Record<NonNullable<Props['shadow']>, string> = {
  'hard-sm': 'shadow-hard-sm',
  hard: 'shadow-hard',
  'hard-md': 'shadow-hard-md',
  'hard-lg': 'shadow-hard-lg',
  'hard-xl': 'shadow-hard-xl',
}

export default function Card({ shadow = 'hard', className = '', ...rest }: Props) {
  return (
    <div
      className={`bg-white border-2 border-tinta ${shadowClass[shadow]} p-[18px] ${className}`}
      {...rest}
    />
  )
}
