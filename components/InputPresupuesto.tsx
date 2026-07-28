'use client'

import { useState } from 'react'

// Input de montos CLP que muestra "$ 1.000.000" mientras se escribe.
// Hacia afuera siempre entrega los dígitos crudos ("1000000"), así los
// handlers existentes pueden seguir haciendo Number(valor) sin cambios.
function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

function formatear(digitos: string): string {
  const limpio = digitos.replace(/^0+(?=\d)/, '')
  if (!limpio) return ''
  return '$ ' + limpio.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

interface Props {
  /** Modo controlado: dígitos crudos manejados por el padre */
  value?: string
  onChange?: (digitos: string) => void
  /** Modo no controlado: valor inicial + commit al salir del campo */
  defaultValue?: number | null
  onCommit?: (digitos: string) => void
  /** Enter: además de hacer blur, dispara esta acción (ej. agregar etapa) */
  onEnter?: () => void
  placeholder?: string
  className?: string
}

export default function InputPresupuesto({ value, onChange, defaultValue, onCommit, onEnter, placeholder, className }: Props) {
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
      className={className}
    />
  )
}
