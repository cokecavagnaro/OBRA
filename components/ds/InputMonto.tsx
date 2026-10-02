'use client'

import { useState } from 'react'

// Misma lógica de components/InputPresupuesto.tsx: hacia afuera siempre
// entrega dígitos crudos ("1000000"), nunca el string formateado.
function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

function formatear(digitos: string): string {
  const limpio = digitos.replace(/^0+(?=\d)/, '')
  if (!limpio) return ''
  return '$ ' + limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

interface Props {
  value?: string
  onChange?: (digitos: string) => void
  defaultValue?: number | null
  onCommit?: (digitos: string) => void
  onEnter?: () => void
  placeholder?: string
  className?: string
}

export default function InputMonto({
  value,
  onChange,
  defaultValue,
  onCommit,
  onEnter,
  placeholder = '$ 0',
  className = '',
}: Props) {
  const esControlado = value !== undefined
  const [interno, setInterno] = useState(() => (defaultValue != null ? String(defaultValue) : ''))
  const digitos = esControlado ? value : interno

  return (
    <input
      type="text"
      inputMode="numeric"
      value={formatear(digitos)}
      onChange={(e) => {
        const nuevos = soloDigitos(e.target.value)
        if (!esControlado) setInterno(nuevos)
        onChange?.(nuevos)
      }}
      onBlur={() => onCommit?.(digitos)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          ;(e.target as HTMLInputElement).blur()
          onEnter?.()
        }
      }}
      placeholder={placeholder}
      className={`w-full border-2 border-tinta bg-white font-mono text-[15px] px-4 py-[14px] min-h-[44px] focus:outline-none focus:shadow-hard-sm ${className}`}
    />
  )
}
