'use client'

import { useState } from 'react'
import { formatCLP } from '@/lib/mock'
import { tienePermiso } from '@/lib/permisos'
import { aprobarBoleta, rechazarBoleta, reenviarBoleta, updateGastoDatos, deleteGasto, deleteItemGasto } from '@/lib/supabase/db'
import { descuentoDeItem, calcularNetoBruto } from '@/lib/confianzaDocumento'
import ClasificacionModal from './ClasificacionModal'
import CruceItemsTotal from './CruceItemsTotal'
import type { Gasto, ItemGasto, Etapa, Partida, Usuario, PermissionOverride } from '@/lib/types'

interface Props {
  gasto: Gasto
  usuarioActual: Usuario | null
  overrides: PermissionOverride[]
  etapas: Etapa[]
  partidas: Partida[]
  etiquetasSugeridas: string[]
  onActualizado: (gasto: Gasto) => void
  onEliminado: (gastoId: string) => void
  onCerrar: () => void
}

const BADGE_ESTADO: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  aprobado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
}
const LABEL_ESTADO: Record<string, string> = { pendiente: 'Pendiente', aprobado: 'Aprobada', rechazado: 'Rechazada' }

const LABEL_ACCION: Record<string, string> = {
  solicitada: '📤 Solicitada',
  editada: '✏️ Editada',
  aprobada: '✅ Aprobada',
  rechazada: '⛔ Rechazada',
  reenviada: '🔁 Reenviada',
  eliminada: '🗑️ Eliminada',
}

async function descargarImagen(url: string, nombreArchivo: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

export default function FichaBoleta({
  gasto: gastoInicial,
  usuarioActual,
  overrides,
  etapas,
  partidas,
  etiquetasSugeridas,
  onActualizado,
  onEliminado,
  onCerrar,
}: Props) {
  const [gasto, setGasto] = useState(gastoInicial)
  const [itemEditando, setItemEditando] = useState<ItemGasto | null>(null)
  const [confirmandoEliminarItem, setConfirmandoEliminarItem] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [comentarioReenvio, setComentarioReenvio] = useState('')
  const [confirmandoEliminarBoleta, setConfirmandoEliminarBoleta] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [yaResuelta, setYaResuelta] = useState(false)
  const [editandoDatos, setEditandoDatos] = useState(false)
  const [proveedorEdit, setProveedorEdit] = useState(gasto.proveedor)
  const [rutEdit, setRutEdit] = useState(gasto.rut_proveedor)
  const [fechaEdit, setFechaEdit] = useState(gasto.fecha_boleta)
  const [historialAbierto, setHistorialAbierto] = useState(false)

  const esAprobador = usuarioActual ? tienePermiso(usuarioActual, overrides, 'approve_boletas') : false
  const esSolicitante = !!usuarioActual && usuarioActual.id === gasto.solicitante_id
  const puedoResolver = esAprobador && gasto.estado_aprobacion === 'pendiente'
  const puedoGestionarRechazo = esSolicitante && gasto.estado_aprobacion === 'rechazado'
  const puedoEditar = puedoResolver || puedoGestionarRechazo

  function actualizarLocal(cambios: Partial<Gasto>) {
    const actualizado = { ...gasto, ...cambios }
    setGasto(actualizado)
    onActualizado(actualizado)
  }

  async function handleAprobar() {
    setProcesando(true)
    const r = await aprobarBoleta(gasto.id)
    setProcesando(false)
    if (r.yaResuelta) { setYaResuelta(true); return }
    if (r.ok) actualizarLocal({ estado_aprobacion: 'aprobado', aprobado_por_id: usuarioActual?.id ?? null, aprobado_por_email: usuarioActual?.email ?? null })
  }

  async function handleRechazar() {
    if (!motivoRechazo.trim()) return
    setProcesando(true)
    const r = await rechazarBoleta(gasto.id, motivoRechazo)
    setProcesando(false)
    if (r.yaResuelta) { setYaResuelta(true); return }
    if (r.ok) {
      actualizarLocal({ estado_aprobacion: 'rechazado', motivo_rechazo: motivoRechazo.trim(), aprobado_por_id: usuarioActual?.id ?? null, aprobado_por_email: usuarioActual?.email ?? null })
      setRechazando(false)
      setMotivoRechazo('')
    }
  }

  async function handleReenviar() {
    setProcesando(true)
    const r = await reenviarBoleta(gasto.id, comentarioReenvio.trim() || undefined)
    setProcesando(false)
    if (r.ok) {
      actualizarLocal({ estado_aprobacion: 'pendiente', motivo_rechazo: null, aprobado_por_id: null, aprobado_por_email: null, fecha_solicitud: new Date().toISOString() })
      setComentarioReenvio('')
    }
  }

  async function handleEliminarBoleta() {
    setProcesando(true)
    const ok = await deleteGasto(gasto.id)
    setProcesando(false)
    if (ok) onEliminado(gasto.id)
  }

  async function handleEliminarItem(item: ItemGasto) {
    const resultado = await deleteItemGasto(item.id)
    if (resultado) {
      actualizarLocal({ total: resultado.nuevoTotal, items: (gasto.items ?? []).filter((i) => i.id !== item.id) })
    }
    setConfirmandoEliminarItem(null)
  }

  async function handleGuardarDatos() {
    setProcesando(true)
    const r = await updateGastoDatos(gasto.id, { proveedor: proveedorEdit, rut_proveedor: rutEdit, fecha_boleta: fechaEdit })
    setProcesando(false)
    if (r.ok) {
      actualizarLocal({ proveedor: proveedorEdit, rut_proveedor: rutEdit, fecha_boleta: fechaEdit })
      setEditandoDatos(false)
    }
  }

  function handleItemGuardado(itemActualizado: ItemGasto, _nuevasEtapas: Etapa[], _nuevasPartidas: Partida[], nuevoTotalGasto?: number) {
    actualizarLocal({
      total: nuevoTotalGasto ?? gasto.total,
      items: (gasto.items ?? []).map((i) => i.id === itemActualizado.id ? itemActualizado : i),
    })
    setItemEditando(null)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={onCerrar}>
      <div
        className="bg-white rounded-t-2xl w-full max-w-[390px] flex flex-col"
        style={{ maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 truncate">{gasto.proveedor}</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${BADGE_ESTADO[gasto.estado_aprobacion]}`}>
                {LABEL_ESTADO[gasto.estado_aprobacion]}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">RUT {gasto.rut_proveedor} · {gasto.fecha_boleta}</p>
            {gasto.descuento_general_monto ? (
              <div className="mt-1">
                <p className="text-xs text-gray-400">Subtotal antes de descuento: {formatCLP(gasto.total + gasto.descuento_general_monto)}</p>
                <p className="text-xs text-gray-400">
                  Descuento: -{formatCLP(gasto.descuento_general_monto)}
                  {gasto.descuento_general_descripcion ? ` (${gasto.descuento_general_descripcion})` : ''}
                </p>
                <p className="text-base font-bold text-gray-900 mt-0.5">Total pagado: {formatCLP(gasto.total)}</p>
              </div>
            ) : (
              <p className="text-base font-bold text-gray-900 mt-1">{formatCLP(gasto.total)}</p>
            )}
            {gasto.creado_por_email && (
              <p className="text-[10px] text-gray-400 mt-1">Solicitado por {gasto.creado_por_email}</p>
            )}
            {gasto.comentario && (
              <p className="text-xs text-gray-500 italic mt-1">💬 {gasto.comentario}</p>
            )}
          </div>
          <div className="flex flex-col gap-2 items-end shrink-0 ml-3">
            {gasto.imagen_url && (
              <button
                onClick={(e) => { e.stopPropagation(); descargarImagen(gasto.imagen_url!, `boleta-${gasto.proveedor}.jpg`) }}
                className="flex items-center gap-1 bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar
              </button>
            )}
            <button onClick={onCerrar} className="text-xs text-gray-400 px-3 py-1.5 border border-gray-200 rounded-lg">Cerrar</button>
          </div>
        </div>

        <div
          className="overflow-y-auto flex-1"
          style={!puedoEditar ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px) + 64px)' } : undefined}
        >
          {gasto.imagen_url ? (
            <img src={gasto.imagen_url} alt={gasto.proveedor} className="w-full" />
          ) : (
            <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-5xl">🧾</div>
          )}

          <div className="px-4 py-4 space-y-4">
            {yaResuelta && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <p className="text-xs text-amber-700">Esta boleta ya fue resuelta por otro aprobador. Cerrá y volvé a abrirla para ver el estado actual.</p>
              </div>
            )}

            {/* Metadata de aprobación */}
            {gasto.estado_aprobacion !== 'aprobado' || gasto.aprobado_por_email ? (
              <div className="text-xs text-gray-500 space-y-0.5 bg-gray-50 rounded-lg p-3">
                {gasto.fecha_solicitud && <p>Solicitada: {formatFechaHora(gasto.fecha_solicitud)}</p>}
                {gasto.aprobado_por_email && (
                  <p>{gasto.estado_aprobacion === 'rechazado' ? 'Rechazada' : 'Aprobada'} por {gasto.aprobado_por_email}{gasto.fecha_resolucion ? ` · ${formatFechaHora(gasto.fecha_resolucion)}` : ''}</p>
                )}
                {gasto.motivo_rechazo && <p className="text-red-600">Motivo: {gasto.motivo_rechazo}</p>}
              </div>
            ) : null}

            {/* Datos de la boleta (editable por aprobador o dueño en rechazo) */}
            {puedoEditar && (
              editandoDatos ? (
                <div className="space-y-2 bg-blue-50 rounded-lg p-3">
                  <input value={proveedorEdit} onChange={(e) => setProveedorEdit(e.target.value)} placeholder="Proveedor" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white" />
                  <input value={rutEdit} onChange={(e) => setRutEdit(e.target.value)} placeholder="RUT" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white" />
                  <input type="date" value={fechaEdit} onChange={(e) => setFechaEdit(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white" />
                  <div className="flex gap-2">
                    <button onClick={handleGuardarDatos} disabled={procesando} className="flex-1 bg-blue-600 text-white rounded-lg py-1.5 text-xs font-semibold disabled:opacity-50">Guardar datos</button>
                    <button onClick={() => setEditandoDatos(false)} className="text-xs text-gray-400 px-3">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setEditandoDatos(true)} className="text-xs text-blue-600 font-medium">Editar proveedor / RUT / fecha</button>
              )
            )}

            <CruceItemsTotal items={gasto.items ?? []} total={gasto.total} interpretacion={gasto.interpretacion_precios ?? undefined} />

            {/* Ítems */}
            {(gasto.items ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ítems</p>
                {(gasto.items ?? []).map((item) => {
                  const descuento = descuentoDeItem(item)
                  const { bruto } = calcularNetoBruto(item.subtotal, gasto.interpretacion_precios ?? 'bruto')
                  return confirmandoEliminarItem === item.id ? (
                    <div key={item.id} className="bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 flex items-center justify-between">
                      <span className="text-xs text-red-600 font-medium">¿Eliminar ítem?</span>
                      <div className="flex items-center gap-3">
                        <button onClick={() => handleEliminarItem(item)} className="text-xs font-semibold text-red-600">Sí</button>
                        <button onClick={() => setConfirmandoEliminarItem(null)} className="text-xs font-medium text-gray-400">No</button>
                      </div>
                    </div>
                  ) : (
                    <div key={item.id} className="flex items-center justify-between text-xs text-gray-500">
                      <span className="truncate flex-1">{item.descripcion}</span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span>
                          {formatCLP(bruto)}
                          {descuento && <span className="text-gray-300"> · desc {formatCLP(descuento.monto)}</span>}
                        </span>
                        {puedoEditar && (
                          <>
                            <button onClick={() => setItemEditando(item)} className="text-gray-300 hover:text-blue-500">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => setConfirmandoEliminarItem(item.id)} className="text-gray-300 hover:text-red-500">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Historial de aprobación */}
            {(gasto.historial_aprobacion ?? []).length > 0 && (
              <div>
                <button onClick={() => setHistorialAbierto((v) => !v)} className="text-[10px] text-blue-600 font-medium">
                  {historialAbierto ? 'Ocultar historial' : `Ver historial (${(gasto.historial_aprobacion ?? []).length})`}
                </button>
                {historialAbierto && (
                  <div className="mt-1.5 space-y-2 bg-gray-50 rounded-lg p-2">
                    {(gasto.historial_aprobacion ?? []).map((ev) => (
                      <div key={ev.id} className="text-[10px] text-gray-500">
                        <p><span className="font-medium text-gray-700">{LABEL_ACCION[ev.accion] ?? ev.accion}</span></p>
                        {ev.comentario && <p className="italic text-gray-400 mt-0.5">💬 {ev.comentario}</p>}
                        <p className="text-gray-300 mt-0.5">{ev.usuario_email} · {formatFechaHora(ev.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {puedoEditar && (
          <div
            className="px-4 pt-3 border-t border-gray-100 shrink-0 space-y-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px) + 64px)' }}
          >
            {puedoResolver && (
              <div className="space-y-2">
                {rechazando ? (
                  <div className="space-y-2 bg-red-50 rounded-lg p-3">
                    <textarea
                      value={motivoRechazo}
                      onChange={(e) => setMotivoRechazo(e.target.value)}
                      placeholder="Motivo del rechazo (obligatorio)"
                      rows={2}
                      className="w-full border border-red-200 rounded-lg px-2 py-1.5 text-xs bg-white resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleRechazar} disabled={procesando || !motivoRechazo.trim()} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-xs font-semibold disabled:opacity-50">Confirmar rechazo</button>
                      <button onClick={() => { setRechazando(false); setMotivoRechazo('') }} className="text-xs text-gray-400 px-3">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={handleAprobar} disabled={procesando} className="flex-1 bg-green-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">Aprobar</button>
                    <button onClick={() => setRechazando(true)} disabled={procesando} className="flex-1 bg-red-50 text-red-600 border border-red-200 rounded-xl py-3 text-sm font-semibold disabled:opacity-50">Rechazar</button>
                  </div>
                )}
              </div>
            )}

            {puedoGestionarRechazo && (
              <div className="space-y-2">
                <input
                  value={comentarioReenvio}
                  onChange={(e) => setComentarioReenvio(e.target.value)}
                  placeholder="Comentario para el reenvío (opcional)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700"
                />
                {confirmandoEliminarBoleta ? (
                  <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    <span className="text-xs text-red-600 font-medium">¿Eliminar esta boleta?</span>
                    <div className="flex items-center gap-3">
                      <button onClick={handleEliminarBoleta} disabled={procesando} className="text-xs font-semibold text-red-600">Sí</button>
                      <button onClick={() => setConfirmandoEliminarBoleta(false)} className="text-xs font-medium text-gray-400">No</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={handleReenviar} disabled={procesando} className="flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">Reenviar</button>
                    <button onClick={() => setConfirmandoEliminarBoleta(true)} disabled={procesando} className="flex-1 bg-red-50 text-red-600 border border-red-200 rounded-xl py-3 text-sm font-semibold disabled:opacity-50">Eliminar boleta</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {itemEditando && (
        <ClasificacionModal
          item={itemEditando}
          proyectoId={gasto.proyecto_id}
          etapas={etapas}
          partidas={partidas}
          etiquetasSugeridas={etiquetasSugeridas}
          puedeEtiquetar
          onGuardado={handleItemGuardado}
          onCerrar={() => setItemEditando(null)}
        />
      )}
    </div>
  )
}

function formatFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
