'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { GASTOS_MOCK, OBRAS_MOCK, formatCLP } from '@/lib/mock'
import type { ItemGasto } from '@/lib/types'

interface ItemConGasto extends ItemGasto {
  obra_id: string
  proveedor: string
  fecha: string
  obra: string
  etapa: string
  partida: string
}

const itemsBase: ItemConGasto[] = GASTOS_MOCK.flatMap((g) =>
  (g.items ?? [])
    .filter((i) => i.estado === 'pendiente')
    .map((i) => ({
      ...i,
      obra_id: g.obra_id,
      proveedor: g.proveedor,
      fecha: g.fecha_boleta,
      obra: g.obra?.nombre ?? '',
      etapa: g.etapa?.nombre ?? '',
      partida: g.partida?.nombre ?? '',
    }))
)

function PendientesContenido() {
  const searchParams = useSearchParams()
  const obraParam = searchParams.get('obra') ?? 'todas'

  const [items, setItems] = useState<ItemConGasto[]>(itemsBase)
  const [obraFiltro, setObraFiltro] = useState(obraParam)
  const [tagsEdit, setTagsEdit] = useState<Record<string, string>>({})

  const activos = items.filter(
    (i) => i.estado === 'pendiente' && (obraFiltro === 'todas' || i.obra_id === obraFiltro)
  )

  function confirmar(id: string) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, estado: 'confirmado' as const } : i))
  }

  function rechazar(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function addTag(id: string, tag: string) {
    setItems((prev) => prev.map((i) =>
      i.id === id ? { ...i, etiquetas: [...i.etiquetas, tag.toLowerCase().trim()] } : i
    ))
  }

  function removeTag(id: string, tag: string) {
    setItems((prev) => prev.map((i) =>
      i.id === id ? { ...i, etiquetas: i.etiquetas.filter((t) => t !== tag) } : i
    ))
  }

  function handleTagKey(e: React.KeyboardEvent<HTMLInputElement>, id: string) {
    if (e.key === 'Enter' && tagsEdit[id]?.trim()) {
      addTag(id, tagsEdit[id])
      setTagsEdit((prev) => ({ ...prev, [id]: '' }))
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 pt-12 pb-3 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Ítems pendientes</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {activos.length} ítem{activos.length !== 1 ? 's' : ''} por revisar
        </p>

        {/* Filtro por obra */}
        <select
          value={obraFiltro}
          onChange={(e) => setObraFiltro(e.target.value)}
          className="mt-3 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white"
        >
          <option value="todas">Todas las obras</option>
          {OBRAS_MOCK.map((o) => (
            <option key={o.id} value={o.id}>{o.nombre}</option>
          ))}
        </select>
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
            <p className="text-xs text-gray-400 mt-1">No hay ítems pendientes{obraFiltro !== 'todas' ? ' en esta obra' : ''}</p>
          </div>
        )}

        {activos.map((item) => (
          <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50/20 p-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{item.descripcion}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.proveedor} · {item.fecha}</p>
              </div>
              <span className="bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                ⚠ {Math.round(item.confianza_ia * 100)}%
              </span>
            </div>

            {/* Montos */}
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <span>{item.cantidad} {item.unidad}</span>
              <span>·</span>
              <span>{formatCLP(item.precio_unitario)} c/u</span>
              <span>·</span>
              <span className="font-semibold text-gray-700">{formatCLP(item.subtotal)}</span>
            </div>

            {/* Ruta */}
            <p className="text-xs text-gray-400 mb-3 truncate">
              {item.obra} › {item.etapa} › {item.partida}
            </p>

            {/* Tags editables */}
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Etiquetas</p>
              <div className="flex flex-wrap gap-1 items-center">
                {item.etiquetas.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => removeTag(item.id, tag)}
                    className="flex items-center gap-1 bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full hover:bg-red-50 hover:text-red-400 transition-colors"
                  >
                    {tag} ×
                  </button>
                ))}
                <input
                  type="text"
                  value={tagsEdit[item.id] ?? ''}
                  onChange={(e) => setTagsEdit((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  onKeyDown={(e) => handleTagKey(e, item.id)}
                  placeholder="+ etiqueta"
                  className="text-[10px] text-gray-500 bg-transparent outline-none border border-dashed border-gray-300 rounded-full px-2 py-0.5 w-20 placeholder-gray-300"
                />
              </div>
            </div>

            {/* Acciones */}
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

export default function Pendientes() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-gray-400 text-sm">Cargando...</p></div>}>
      <PendientesContenido />
    </Suspense>
  )
}
