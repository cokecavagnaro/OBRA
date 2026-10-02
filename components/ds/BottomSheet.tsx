'use client'

import type { ReactNode } from 'react'
import Button from './Button'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Texto del botón de cierre inferior. Si es null, no se muestra. */
  labelListo?: string | null
}

export default function BottomSheet({ open, onClose, title, children, labelListo = 'Listo' }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-[390px] max-h-[85vh] overflow-y-auto bg-white border-t-2 border-tinta p-[18px] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">{title}</h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        )}
        {children}
        {labelListo && (
          <Button variant="secondary" className="!bg-tinta !text-white" onClick={onClose}>
            {labelListo}
          </Button>
        )}
      </div>
    </div>
  )
}
