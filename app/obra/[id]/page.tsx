'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { GASTOS_MOCK, OBRAS_MOCK, ETAPAS_MOCK, PARTIDAS_MOCK, formatCLP } from '@/lib/mock'
import { getGastosByObra } from '@/lib/storage'
import type { Gasto } from '@/lib/types'

export default function ObraDetalle() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [gastosLocal, setGastosLocal] = useState<Gasto[]>([])
  const [filtroEtapa, setFiltroEtapa] = useState<string | null>(null)
  const [filtroPartida, setFiltroPartida] = useState<string | null>(null)
  const [filtrosEtiqueta, setFiltrosEtiqueta] = useState<string[]>([])

  useEffect(() => {
    setGastosLocal(getGastosByObra(id))
  }, [id])

  const obra = OBRAS_MOCK.find((o) => o.id === id)
  const gastos = [...GASTOS_MOCK.filter((g) => g.obra_id === id), ...gastosLocal]

  if (!obra) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-400">Obra no encontrada</p>
    </div>
  )

  const totalObra = gastos.reduce((s, g) => s + g.total, 0)
  const pendientesCount = gastos.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length

  // Datos para filtros
  const etapasObra = ETAPAS_MOCK.filter((e) => e.obra_id === id)
  const partidasDisponibles = filtroEtapa
    ? PARTIDAS_MOCK.filter((p) => p.etapa_id === filtroEtapa)
    : PARTIDAS_MOCK.filter((p) => etapasObra.some((e) => e.id === p.etapa_id))
  const etiquetasUnicas = Array.from(new Set(gastos.flatMap((g) => (g.items ?? []).flatMap((i) => i.etiquetas)))).sort()

  // Filtrado combinado
  const gastosFiltrados = gastos.filter((g) => {
    const items = g.items ?? []
    if (filtroEtapa && !items.some((i) => i.etapa_id === filtroEtapa)) return false
    if (filtroPartida && !items.some((i) => i.partida_id === filtroPartida)) return false
    if (filtrosEtiqueta.length > 0 && !filtrosEtiqueta.every((tag) => items.some((i) => i.etiquetas.includes(tag)))) return false
    return true
  })

  const hayFiltros = filtroEtapa || filtroPartida || filtrosEtiqueta.length > 0

  function toggleEtiqueta(tag: string) {
    setFiltrosEtiqueta((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  function limpiarFiltros() {
    setFiltroEtapa(null)
    setFiltroPartida(null)
    setFiltrosEtiqueta([])
  }

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

      {/* Galería de boletas */}
      {gastos.length > 0 && (
        <div className="px-4 pt-4 pb-2 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Boletas escaneadas ({gastos.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {gastos.map((g) => (
              <GaleriaThumbnail key={g.id} gasto={g} />
            ))}
          </div>
        </div>
      )}

      {/* Panel de filtros combinados */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-3">

        {/* Filtro Etapa */}
        {etapasObra.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Etapa</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              <button
                onClick={() => { setFiltroEtapa(null); setFiltroPartida(null) }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  !filtroEtapa ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
                }`}
              >
                Todas
              </button>
              {etapasObra.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setFiltroEtapa(e.id === filtroEtapa ? null : e.id); setFiltroPartida(null) }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    filtroEtapa === e.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  {e.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtro Partida */}
        {partidasDisponibles.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Partida</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setFiltroPartida(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  !filtroPartida ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
                }`}
              >
                Todas
              </button>
              {partidasDisponibles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFiltroPartida(p.id === filtroPartida ? null : p.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    filtroPartida === p.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filtro Etiquetas (multi-selección) */}
        {etiquetasUnicas.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Etiquetas</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-none flex-wrap">
              {etiquetasUnicas.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleEtiqueta(tag)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    filtrosEtiqueta.includes(tag)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Limpiar filtros */}
        {hayFiltros && (
          <button onClick={limpiarFiltros} className="text-xs text-blue-600 font-medium">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Lista de boletas filtradas */}
      <div className="px-4 py-4 space-y-3">
        {gastosFiltrados.length === 0 ? <Vacio /> : gastosFiltrados.map((gasto) => (
          <div key={gasto.id} className="rounded-xl border border-gray-100 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{gasto.proveedor}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatFecha(gasto.fecha_boleta)}</p>
              </div>
              <p className="text-sm font-bold text-gray-900 shrink-0">{formatCLP(gasto.total)}</p>
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
            <div className="flex flex-wrap gap-1 mt-2">
              {Array.from(new Set((gasto.items ?? []).flatMap((i) => i.etiquetas))).map((tag) => (
                <span
                  key={tag}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    filtrosEtiqueta.includes(tag) ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
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

function GaleriaThumbnail({ gasto }: { gasto: Gasto }) {
  const [expandido, setExpandido] = useState(false)

  return (
    <>
      <button onClick={() => setExpandido(true)} className="rounded-xl overflow-hidden border border-gray-100 text-left w-full">
        {gasto.imagen_url ? (
          <img src={gasto.imagen_url} alt={gasto.proveedor} className="w-full h-16 object-cover" />
        ) : (
          <div className="w-full h-16 bg-gray-100 flex items-center justify-center text-2xl">🧾</div>
        )}
        <div className="p-1.5">
          <p className="text-[10px] font-medium text-gray-700 truncate">{gasto.proveedor}</p>
          <p className="text-[10px] text-gray-400">{formatCLP(gasto.total)}</p>
        </div>
      </button>

      {/* Modal simple */}
      {expandido && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
          onClick={() => setExpandido(false)}
        >
          <div
            className="bg-white rounded-t-2xl w-full max-w-[390px] p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            {gasto.imagen_url ? (
              <img src={gasto.imagen_url} alt={gasto.proveedor} className="w-full rounded-xl mb-3 max-h-48 object-cover" />
            ) : (
              <div className="w-full h-32 bg-gray-100 rounded-xl flex items-center justify-center text-4xl mb-3">🧾</div>
            )}
            <p className="text-sm font-semibold text-gray-900">{gasto.proveedor}</p>
            <p className="text-xs text-gray-400 mt-0.5">RUT {gasto.rut_proveedor} · {gasto.fecha_boleta}</p>
            <p className="text-lg font-bold text-gray-900 mt-2">{formatCLP(gasto.total)}</p>
            <p className="text-xs text-gray-400 mt-1">{gasto.etapa?.nombre} › {gasto.partida?.nombre}</p>
            <button
              onClick={() => setExpandido(false)}
              className="mt-4 w-full border border-gray-200 rounded-xl py-2.5 text-sm text-gray-500"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
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



function formatFecha(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
