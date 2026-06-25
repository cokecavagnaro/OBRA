'use client'

import { useState } from 'react'
import { formatCLP } from '@/lib/mock'
import type { ItemAnalizado } from '@/lib/types'

interface ItemCardProps {
  item: ItemAnalizado
  checked: boolean
  onToggle: () => void
  onTagAdd: (tag: string) => void
  onTagRemove: (tag: string) => void
}

export default function ItemCard({ item, checked, onToggle, onTagAdd, onTagRemove }: ItemCardProps) {
  const [nuevoTag, setNuevoTag] = useState('')
  const baja = item.confianza < 0.7

  function handleAddTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && nuevoTag.trim()) {
      onTagAdd(nuevoTag.trim().toLowerCase())
      setNuevoTag('')
    }
  }

  return (
    <div className={`rounded-xl border p-3 ${baja ? 'border-amber-200 bg-amber-50/20' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
            checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
          }`}
        >
          {checked && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 leading-snug">{item.descripcion}</p>
            {baja && (
              <span className="shrink-0 bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                ⚠ Revisar
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <span>{item.cantidad} {item.unidad}</span>
            <span>·</span>
            <span>{formatCLP(item.precio_unitario)} c/u</span>
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-400">{item.categoria}</span>
            <span className="text-sm font-semibold text-gray-900">{formatCLP(item.subtotal)}</span>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1 mt-2">
            {item.etiquetas.map((tag) => (
              <button
                key={tag}
                onClick={() => onTagRemove(tag)}
                className="flex items-center gap-1 bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full hover:bg-red-50 hover:text-red-400 transition-colors"
              >
                {tag} ×
              </button>
            ))}
            <input
              type="text"
              value={nuevoTag}
              onChange={(e) => setNuevoTag(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="+ tag"
              className="text-[10px] text-gray-400 bg-transparent outline-none w-12 placeholder-gray-300"
            />
          </div>

          {baja && (
            <p className="mt-1.5 text-[10px] text-amber-600">
              Confianza IA: {Math.round(item.confianza * 100)}% — verificar descripción y monto
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
