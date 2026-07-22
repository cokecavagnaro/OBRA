'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { formatCLP } from '@/lib/mock'
import { getAllGastos, getUsuarioActual, getPermisosOverrides, getEtapas, getPartidas } from '@/lib/supabase/db'
import { tienePermiso } from '@/lib/permisos'
import FichaBoleta from '@/components/FichaBoleta'
import type { Gasto, Etapa, Partida, Usuario, PermissionOverride } from '@/lib/types'

type Tab = 'pendientes' | 'aprobadas'

const BADGE_ESTADO: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  aprobado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
}
const LABEL_ESTADO: Record<string, string> = { pendiente: 'Pendiente', aprobado: 'Aprobada', rechazado: 'Rechazada' }

function AprobacionesContenido() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') === 'aprobadas' ? 'aprobadas' : 'pendientes'
  const [tab, setTab] = useState<Tab>(tabParam)

  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null)
  const [overrides, setOverrides] = useState<PermissionOverride[]>([])

  const [gastoSeleccionado, setGastoSeleccionado] = useState<Gasto | null>(null)
  const [etapasSel, setEtapasSel] = useState<Etapa[]>([])
  const [partidasSel, setPartidasSel] = useState<Partida[]>([])

  const esAprobador = usuarioActual ? tienePermiso(usuarioActual, overrides, 'approve_boletas') : false

  useEffect(() => {
    getAllGastos().then((g) => { setGastos(g); setLoading(false) })
    getUsuarioActual().then(async (u) => {
      setUsuarioActual(u)
      if (u) setOverrides(await getPermisosOverrides(u.id))
    })
  }, [])

  async function abrirFicha(g: Gasto) {
    setGastoSeleccionado(g)
    const [e, p] = await Promise.all([getEtapas(g.proyecto_id), getPartidas(g.proyecto_id)])
    setEtapasSel(e)
    setPartidasSel(p)
  }

  function handleActualizado(gastoActualizado: Gasto) {
    setGastos((prev) => prev.map((g) => g.id === gastoActualizado.id ? gastoActualizado : g))
    setGastoSeleccionado(gastoActualizado)
  }

  function handleEliminado(gastoId: string) {
    setGastos((prev) => prev.filter((g) => g.id !== gastoId))
    setGastoSeleccionado(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  const enRevision = gastos
    .filter((g) => g.estado_aprobacion !== 'aprobado')
    .filter((g) => esAprobador || g.solicitante_id === usuarioActual?.id)
    .sort((a, b) => (b.fecha_solicitud ?? '').localeCompare(a.fecha_solicitud ?? ''))

  const aprobadasPorTerceros = gastos.filter((g) => g.estado_aprobacion === 'aprobado' && g.aprobado_por_id)
  const grupos = new Map<string, { email: string; total: number; boletas: Gasto[] }>()
  for (const g of aprobadasPorTerceros) {
    const key = g.aprobado_por_email ?? 'Desconocido'
    const grupo = grupos.get(key) ?? { email: key, total: 0, boletas: [] }
    grupo.total += g.total
    grupo.boletas.push(g)
    grupos.set(key, grupo)
  }
  const gruposOrdenados = Array.from(grupos.values()).sort((a, b) => b.total - a.total)

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Aprobaciones</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {esAprobador ? 'Boletas de toda la cuenta que esperan tu resolución' : 'Tus solicitudes de aprobación'}
        </p>

        <div className="flex gap-2 mt-4 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTab('pendientes')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${tab === 'pendientes' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
          >
            Pendientes
          </button>
          <button
            onClick={() => setTab('aprobadas')}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${tab === 'aprobadas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
          >
            Aprobadas
          </button>
        </div>
      </div>

      {tab === 'pendientes' && (
        <div className="px-4 py-4 space-y-3">
          {enRevision.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm font-medium text-gray-600">Nada por revisar</p>
              <p className="text-xs text-gray-400 mt-1">No hay boletas pendientes ni rechazadas</p>
            </div>
          )}
          {enRevision.map((g) => (
            <button
              key={g.id}
              onClick={() => abrirFicha(g)}
              className="w-full text-left rounded-xl border border-gray-100 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{g.proveedor}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Solicitada por {g.creado_por_email ?? 'desconocido'}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${BADGE_ESTADO[g.estado_aprobacion]}`}>
                  {LABEL_ESTADO[g.estado_aprobacion]}
                </span>
              </div>
              {g.comentario && <p className="text-xs text-gray-500 italic mt-1.5">💬 {g.comentario}</p>}
              <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                <span>Boleta: {formatFecha(g.fecha_boleta)}</span>
                <span className="font-bold text-gray-900 text-sm">{formatCLP(g.total)}</span>
              </div>
              {g.fecha_solicitud && (
                <p className="text-[10px] text-gray-300 mt-1">Solicitada: {formatFecha(g.fecha_solicitud.slice(0, 10))}</p>
              )}
              {g.motivo_rechazo && <p className="text-[10px] text-red-500 mt-1">Motivo: {g.motivo_rechazo}</p>}
            </button>
          ))}
        </div>
      )}

      {tab === 'aprobadas' && (
        <div className="px-4 py-4 space-y-4">
          {gruposOrdenados.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm font-medium text-gray-600">Todavía no hay boletas aprobadas por alguien</p>
              <p className="text-xs text-gray-400 mt-1">Las boletas que subís vos como admin no aparecen acá</p>
            </div>
          )}
          {gruposOrdenados.map((grupo) => (
            <div key={grupo.email} className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-900">{grupo.email}</p>
                <p className="text-sm font-bold text-green-700">{formatCLP(grupo.total)}</p>
              </div>
              <div className="space-y-1.5">
                {grupo.boletas.map((g) => (
                  <button key={g.id} onClick={() => abrirFicha(g)} className="w-full flex items-center justify-between text-xs text-gray-500">
                    <span className="truncate flex-1 text-left">{g.proveedor}</span>
                    <span className="shrink-0 ml-2">{formatCLP(g.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {gastoSeleccionado && (
        <FichaBoleta
          gasto={gastoSeleccionado}
          usuarioActual={usuarioActual}
          overrides={overrides}
          etapas={etapasSel}
          partidas={partidasSel}
          etiquetasSugeridas={[]}
          onActualizado={handleActualizado}
          onEliminado={handleEliminado}
          onCerrar={() => setGastoSeleccionado(null)}
        />
      )}
    </div>
  )
}

function formatFecha(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Aprobaciones() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-gray-400 text-sm">Cargando...</p></div>}>
      <AprobacionesContenido />
    </Suspense>
  )
}
