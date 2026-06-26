'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { GASTOS_MOCK, OBRAS_MOCK, ETAPAS_MOCK, PARTIDAS_MOCK, formatCLP } from '@/lib/mock'
import type { Gasto } from '@/lib/types'

type AgrupacionKey = 'partida' | 'etiqueta'

export default function ObraDetalle() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [agrupacion, setAgrupacion] = useState<AgrupacionKey>('partida')

  const obra = OBRAS_MOCK.find((o) => o.id === id)
  const gastos = GASTOS_MOCK.filter((g) => g.obra_id === id)

  if (!obra) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-400">Obra no encontrada</p>
    </div>
  )

  const totalObra = gastos.reduce((s, g) => s + g.total, 0)
  const pendientesCount = gastos.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length

  // Agrupación por partida
  const porPartida = agruparPorPartida(gastos)

  // Agrupación por etiqueta
  const porEtiqueta = agruparPorEtiqueta(gastos)

  function handleExportar() {
    // TODO: conectar con lib/exportar.ts cuando esté Supabase
    alert('Exportación Excel disponible cuando se conecte Supabase')
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{obra.nombre}</h1>
            <p className="text-xs text-gray-400">{gastos.length} boleta{gastos.length !== 1 ? 's' : ''}</p>
          </div>
          {pendientesCount > 0 && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-1 rounded-full shrink-0">
              ⚠ {pendientesCount} pendiente{pendientesCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Total grande */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Total gastado</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{formatCLP(totalObra)}</p>
        </div>
      </div>

      {/* Selector agrupación */}
      <div className="px-4 py-3 border-b border-gray-100 flex gap-2">
        <button
          onClick={() => setAgrupacion('partida')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
            agrupacion === 'partida' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
          }`}
        >
          Por partida
        </button>
        <button
          onClick={() => setAgrupacion('etiqueta')}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
            agrupacion === 'etiqueta' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
          }`}
        >
          Por etiqueta
        </button>
      </div>

      {/* Contenido agrupado */}
      <div className="px-4 py-4 space-y-3">
        {agrupacion === 'partida' && (
          <>
            {porPartida.length === 0 && <Vacio />}
            {porPartida.map((grupo) => (
              <GrupoCard
                key={grupo.nombre}
                nombre={grupo.nombre}
                subtitulo={grupo.etapa}
                total={grupo.total}
                totalObra={totalObra}
                gastos={grupo.gastos}
              />
            ))}
          </>
        )}

        {agrupacion === 'etiqueta' && (
          <>
            {porEtiqueta.length === 0 && <Vacio />}
            {porEtiqueta.map((grupo) => (
              <GrupoCard
                key={grupo.nombre}
                nombre={grupo.nombre}
                total={grupo.total}
                totalObra={totalObra}
                gastos={grupo.gastos}
              />
            ))}
          </>
        )}
      </div>

      {/* Botón exportar */}
      <div className="px-4 pb-6 pt-2">
        <button
          onClick={handleExportar}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white rounded-xl py-3.5 text-sm font-semibold"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar Excel — {obra.nombre}
        </button>
      </div>
    </div>
  )
}

// ---- Componentes auxiliares ----

function GrupoCard({
  nombre,
  subtitulo,
  total,
  totalObra,
  gastos,
}: {
  nombre: string
  subtitulo?: string
  total: number
  totalObra: number
  gastos: Gasto[]
}) {
  const [abierto, setAbierto] = useState(false)
  const pct = totalObra > 0 ? Math.round((total / totalObra) * 100) : 0

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{nombre}</p>
          {subtitulo && <p className="text-xs text-gray-400 mt-0.5">{subtitulo}</p>}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 bg-gray-100 rounded-full h-1">
              <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-gray-400 shrink-0">{pct}%</span>
          </div>
        </div>
        <div className="ml-3 text-right shrink-0">
          <p className="text-sm font-bold text-gray-900">{formatCLP(total)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{gastos.length} boleta{gastos.length !== 1 ? 's' : ''}</p>
        </div>
        <svg
          className={`ml-2 w-4 h-4 text-gray-400 transition-transform shrink-0 ${abierto ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {abierto && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {gastos.map((gasto) => (
            <div key={gasto.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{gasto.proveedor}</p>
                  <p className="text-xs text-gray-400 mt-0.5">RUT {gasto.rut_proveedor} · {formatFecha(gasto.fecha_boleta)}</p>
                </div>
                <p className="text-sm font-semibold text-gray-900 shrink-0">{formatCLP(gasto.total)}</p>
              </div>
              {(gasto.items ?? []).length > 0 && (
                <div className="mt-2 space-y-1">
                  {(gasto.items ?? []).map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-xs text-gray-500">
                      <span className="truncate flex-1">{item.descripcion}</span>
                      <span className="shrink-0 ml-2">{formatCLP(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Tags */}
              {(gasto.items ?? []).flatMap((i) => i.etiquetas).filter(Boolean).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Array.from(new Set((gasto.items ?? []).flatMap((i) => i.etiquetas))).slice(0, 4).map((tag) => (
                    <span key={tag} className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Vacio() {
  return (
    <div className="text-center py-12">
      <p className="text-gray-400 text-sm">No hay gastos registrados</p>
    </div>
  )
}

// ---- Helpers de agrupación ----

function agruparPorPartida(gastos: Gasto[]) {
  const mapa = new Map<string, { nombre: string; etapa: string; total: number; gastos: Gasto[] }>()
  for (const gasto of gastos) {
    const key = gasto.partida_id
    const nombre = gasto.partida?.nombre ?? 'Sin partida'
    const etapa = gasto.etapa?.nombre ?? ''
    if (!mapa.has(key)) mapa.set(key, { nombre, etapa, total: 0, gastos: [] })
    const grupo = mapa.get(key)!
    grupo.total += gasto.total
    grupo.gastos.push(gasto)
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total)
}

function agruparPorEtiqueta(gastos: Gasto[]) {
  const mapa = new Map<string, { nombre: string; total: number; gastos: Gasto[] }>()
  for (const gasto of gastos) {
    const tags = Array.from(new Set((gasto.items ?? []).flatMap((i) => i.etiquetas)))
    if (tags.length === 0) {
      const key = 'sin-etiqueta'
      if (!mapa.has(key)) mapa.set(key, { nombre: 'Sin etiqueta', total: 0, gastos: [] })
      const grupo = mapa.get(key)!
      grupo.total += gasto.total
      grupo.gastos.push(gasto)
    } else {
      for (const tag of tags) {
        if (!mapa.has(tag)) mapa.set(tag, { nombre: tag, total: 0, gastos: [] })
        const grupo = mapa.get(tag)!
        // evitar duplicar el gasto si ya fue contado para este tag
        if (!grupo.gastos.find((g) => g.id === gasto.id)) {
          grupo.total += gasto.total
          grupo.gastos.push(gasto)
        }
      }
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total)
}

function formatFecha(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
