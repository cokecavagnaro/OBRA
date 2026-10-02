import type { InputHTMLAttributes } from 'react'

export default function InputTexto({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full border-2 border-tinta bg-white font-mono text-[15px] px-4 py-[14px] min-h-[44px] focus:outline-none focus:shadow-hard-sm ${className}`}
      {...rest}
    />
  )
}
