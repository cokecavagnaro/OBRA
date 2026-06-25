'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { GASTOS_MOCK, OBRAS_MOCK, formatCLP } from '@/lib/mock'
import type { Gasto } from '@/lib/types'

type Filtro = 'fecha' | 'monto' | 'obra'

export default function Inicio() {
  const [filtro, setFiltro] = useState<Filtro>('fecha')
  const [obraFiltro, setObraFiltro] = useState<string>('todas')

  const gastosFiltrados = useMemo(() => {
    let lista = [...GASTOS_MOCK]
    if (obraFiltro !== 'todas') lista = lista.filter((g) => g.obra_id === obraFiltro)
    if (filtro === 'fecha') lista.sort((a, b) => b.fecha_boleta.localeCompare(a.fecha_boleta))
    if (filtro === 'monto') lista.sort((a, b) => b.total - a.total)
    return lista
  }, [filtro, obraFiltro])

  const totalCLP = gastosFiltrados.reduce((s, g) => s + g.total, 0)
  const pendientesCount = GASTOS_MOCK.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Obra360</h1>
            <p className="text-xs text-gray-400 mt-0.5">Administrador</p>
          </div>
          <div className="flex items-center gap-2">
            {pendientesCount > 0 && (
              <Link
                href="/pendientes"
                className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-3 py-1"
              >
                <span className="w-2 h-2 bg-amber-400 rounded-full"></span>
                <span className="text-xs font-medium text-amber-700">{pendientesCount} pendientes</span>
              </Link>
            )}
            <Link
              href="/config"
              className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 text-gray-500"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Total registrado</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{formatCLP(totalCLP)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Boletas</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{gastosFiltrados.length}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['fecha', 'monto', 'obra'] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filtro === f
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {f === 'fecha' ? 'Por fecha' : f === 'monto' ? 'Por monto' : 'Por obra'}
            </button>
          ))}
        </div>
        {filtro === 'obra' && (
          <select
            value={obraFiltro}
            onChange={(e) => setObraFiltro(e.target.value)}
            className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
          >
            <option value="todas">Todas las obras</option>
            {OBRAS_MOCK.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>
        )}
      </div>

      {/* Lista de gastos */}
      <div className="px-4 py-3 space-y-3">
        {gastosFiltrados.map((gasto) => (
          <GastoCard key={gasto.id} gasto={gasto} />
        ))}
        {gastosFiltrados.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">No hay boletas registradas</p>
          </div>
        )}
      </div>

      {/* Exportar */}
      {gastosFiltrados.length > 0 && (
        <div className="px-4 pb-4">
          <button className="w-full flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar Excel
          </button>
        </div>
      )}
    </div>
  )
}

function GastoCard({ gasto }: { gasto: Gasto }) {
  const items = gasto.items ?? []
  const pendientes = items.filter((i) => i.estado === 'pendiente').length
  const allTags = Array.from(new Set(items.flatMap((i) => i.etiquetas))).slice(0, 3)

  return (
    <div className={`rounded-xl border p-4 ${gasto.estado === 'pendiente' ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{gasto.proveedor}</p>
          <p className="text-xs text-gray-400 mt-0.5">RUT {gasto.rut_proveedor} · {formatFecha(gasto.fecha_boleta)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-gray-900 text-sm">{formatCLP(gasto.total)}</p>
          {pendientes > 0 && (
            <span className="inline-flex items-center gap-1 mt-1 bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
              ⚠ {pendientes} ítem{pendientes > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-400 truncate">
        {gasto.obra?.nombre} › {gasto.etapa?.nombre} › {gasto.partida?.nombre}
      </p>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {allTags.map((tag) => (
            <span key={tag} className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">{items.length} ítem{items.length !== 1 ? 's' : ''}</span>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
          gasto.estado === 'confirmado' ? 'bg-green-50 text-green-600' : 'bg-amber-100 text-amber-700'
        }`}>
          {gasto.estado === 'confirmado' ? 'Confirmado' : 'Pendiente'}
        </span>
      </div>
    </div>
  )
}

function formatFecha(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
