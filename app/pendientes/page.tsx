'use client'

import { useState } from 'react'
import { GASTOS_MOCK, formatCLP } from '@/lib/mock'
import type { ItemGasto } from '@/lib/types'

interface ItemConGasto extends ItemGasto {
  proveedor: string
  fecha: string
  obra: string
  etapa: string
  partida: string
}

const itemsPendientes: ItemConGasto[] = GASTOS_MOCK.flatMap((g) =>
  (g.items ?? [])
    .filter((i) => i.estado === 'pendiente')
    .map((i) => ({
      ...i,
      proveedor: g.proveedor,
      fecha: g.fecha_boleta,
      obra: g.obra?.nombre ?? '',
      etapa: g.etapa?.nombre ?? '',
      partida: g.partida?.nombre ?? '',
    }))
)

export default function Pendientes() {
  const [items, setItems] = useState(itemsPendientes)

  function confirmar(id: string) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, estado: 'confirmado' as const } : i))
  }

  function rechazar(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const activos = items.filter((i) => i.estado === 'pendiente')

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Ítems pendientes</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {activos.length} ítem{activos.length !== 1 ? 's' : ''} por revisar
        </p>
      </div>

      <div className="px-4 py-4 space-y-3">
        {activos.length === 0 && (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-600">Todo al día</p>
            <p className="text-xs text-gray-400 mt-1">No hay ítems pendientes de revisión</p>
          </div>
        )}

        {activos.map((item) => (
          <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/20 p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{item.descripcion}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.proveedor} · {item.fecha}</p>
              </div>
              <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                ⚠ {Math.round(item.confianza_ia * 100)}% confianza
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
              <span>{item.cantidad} {item.unidad}</span>
              <span>·</span>
              <span>{formatCLP(item.precio_unitario)} c/u</span>
              <span>·</span>
              <span className="font-semibold text-gray-700">{formatCLP(item.subtotal)}</span>
            </div>

            <p className="text-xs text-gray-400 mb-3 truncate">
              {item.obra} › {item.etapa} › {item.partida}
            </p>

            {item.etiquetas.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {item.etiquetas.map((tag) => (
                  <span key={tag} className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => rechazar(item.id)}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Rechazar
              </button>
              <button
                onClick={() => confirmar(item.id)}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
