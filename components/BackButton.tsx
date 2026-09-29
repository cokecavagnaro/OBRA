'use client'

import Link from 'next/link'

type BackButtonProps = {
  href?: string
  onClick?: () => void
  ariaLabel?: string
  className?: string
}

const baseClassName = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600'

export default function BackButton({ href, onClick, ariaLabel = 'Volver', className = '' }: BackButtonProps) {
  const content = (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )

  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={`${baseClassName} ${className}`}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={`${baseClassName} ${className}`}>
      {content}
    </button>
  )
}
