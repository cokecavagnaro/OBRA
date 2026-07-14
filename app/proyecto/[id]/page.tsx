'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatCLP } from '@/lib/mock'
import { getProyectos, getEtapas, getPartidas, getGastos, getUsuarioActual, getPermisosOverrides, deleteGasto, deleteItemGasto } from '@/lib/supabase/db'
import { tienePermiso } from '@/lib/permisos'
import * as XLSX from 'xlsx'
import ClasificacionModal from '@/components/ClasificacionModal'
import type { Proyecto, Etapa, Partida, Gasto, ItemGasto, Usuario, PermissionOverride } from '@/lib/types'

export default function ProyectoDetalle() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [partidas, setPartidas] = useState<Partida[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [loading, setLoading] = useState(true)

  const [filtroEtapa, setFiltroEtapa] = useState<string | null>(null)
  const [filtroPartida, setFiltroPartida] = useState<string | null>(null)
  const [filtrosEtiqueta, setFiltrosEtiqueta] = useState<string[]>([])
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [itemEditando, setItemEditando] = useState<ItemGasto | null>(null)
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<string | null>(null)
  const [confirmandoEliminarItem, setConfirmandoEliminarItem] = useState<string | null>(null)

  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null)
  const [overrides, setOverrides] = useState<PermissionOverride[]>([])
  const puedeExportar = usuarioActual ? tienePermiso(usuarioActual, overrides, 'export_excel') : false
  const puedeEditarItems = usuarioActual ? tienePermiso(usuarioActual, overrides, 'edit_scanned_items') : false
  const puedeEliminarGasto = usuarioActual ? tienePermiso(usuarioActual, overrides, 'delete_scanned_items') : false

  useEffect(() => {
    Promise.all([getProyectos(), getEtapas(id), getPartidas(id), getGastos(id)]).then(
      ([proyectos, e, p, g]) => {
        setProyecto(proyectos.find((o) => o.id === id) ?? null)
        setEtapas(e)
        setPartidas(p)
        setGastos(g)
        setLoading(false)
      }
    )
    getUsuarioActual().then(async (u) => {
      setUsuarioActual(u)
      if (u) setOverrides(await getPermisosOverrides(u.id))
    })
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  if (!proyecto) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-400">Proyecto no encontrado</p>
    </div>
  )

  const totalProyecto = gastos.reduce((s, g) => s + g.total, 0)
  const pendientesCount = gastos.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length

  const partidasDisponibles = filtroEtapa
    ? partidas.filter((p) => p.etapa_id === filtroEtapa)
    : partidas

  const etiquetasUnicas = Array.from(
    new Set(gastos.flatMap((g) => (g.items ?? []).flatMap((i) => i.etiquetas)))
  ).sort()

  const hayFiltros = !!(filtroEtapa || filtroPartida || filtrosEtiqueta.length > 0 || filtroFechaDesde || filtroFechaHasta)

  const itemsFiltrados = hayFiltros
    ? gastos
        .flatMap((g) => (g.items ?? []).map((i) => ({ ...i, gasto: g })))
        .filter((i) => {
          if (filtroEtapa && i.etapa_id !== filtroEtapa) return false
          if (filtroPartida && i.partida_id !== filtroPartida) return false
          if (filtrosEtiqueta.length > 0 && !filtrosEtiqueta.some((tag) => i.etiquetas.includes(tag))) return false
          if (filtroFechaDesde && i.gasto.fecha_boleta < filtroFechaDesde) return false
          if (filtroFechaHasta && i.gasto.fecha_boleta > filtroFechaHasta) return false
          return true
        })
    : []
  const subtotalFiltrado = itemsFiltrados.reduce((s, i) => s + i.subtotal, 0)

  function toggleEtiqueta(tag: string) {
    setFiltrosEtiqueta((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  function limpiarFiltros() {
    setFiltroEtapa(null)
    setFiltroPartida(null)
    setFiltrosEtiqueta([])
    setFiltroFechaDesde('')
    setFiltroFechaHasta('')
  }

  function handleItemGuardado(itemActualizado: ItemGasto, nuevasEtapas: Etapa[], nuevasPartidas: Partida[]) {
    setEtapas(nuevasEtapas)
    setPartidas(nuevasPartidas)
    setGastos((prev) =>
      prev.map((g) => ({
        ...g,
        items: (g.items ?? []).map((i) => i.id === itemActualizado.id ? itemActualizado : i),
      }))
    )
    setItemEditando(null)
  }

  async function handleEliminarGasto(gastoId: string) {
    const ok = await deleteGasto(gastoId)
    if (ok) setGastos((prev) => prev.filter((g) => g.id !== gastoId))
    setConfirmandoEliminar(null)
  }

  async function handleEliminarItem(item: ItemGasto, gastoId: string) {
    const gasto = gastos.find((g) => g.id === gastoId)
    if (!gasto) return
    const nuevoTotal = gasto.total - item.subtotal
    const ok = await deleteItemGasto(item.id, gastoId, nuevoTotal)
    if (ok) {
      setGastos((prev) => prev.map((g) => g.id === gastoId
        ? { ...g, total: nuevoTotal, items: (g.items ?? []).filter((i) => i.id !== item.id) }
        : g
      ))
    }
    setConfirmandoEliminarItem(null)
  }

  function itemARow(i: ItemGasto, gasto: Gasto) {
    return {
      Proveedor: gasto.proveedor || '',
      RUT: gasto.rut_proveedor || '',
      Fecha: gasto.fecha_boleta || '',
      Descripción: i.descripcion || '',
      Categoría: i.categoria || '',
      Cantidad: i.cantidad,
      Unidad: i.unidad || '',
      'Precio unitario': i.precio_unitario,
      Subtotal: i.subtotal,
      Etapa: etapas.find((e) => e.id === i.etapa_id)?.nombre ?? '',
      Partida: partidas.find((p) => p.id === i.partida_id)?.nombre ?? '',
      Etiquetas: i.etiquetas.join(', '),
      Estado: i.estado || '',
    }
  }

  function handleExportar() {
    const filas = hayFiltros
      ? itemsFiltrados.map((i) => itemARow(i, i.gasto))
      : gastos.flatMap((g) => (g.items ?? []).map((i) => itemARow(i, g)))
    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, (proyecto?.nombre ?? 'Proyecto').slice(0, 31))
    XLSX.writeFile(wb, `${proyecto?.nombre ?? 'Proyecto'}${hayFiltros ? ' (filtrado)' : ''}.xlsx`)
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
            <h1 className="text-lg font-bold text-gray-900 truncate">{proyecto.nombre}</h1>
            <p className="text-xs text-gray-400">{gastos.length} boleta{gastos.length !== 1 ? 's' : ''}</p>
          </div>
          {pendientesCount > 0 && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-1 rounded-full shrink-0">
              ⚠ {pendientesCount} pendiente{pendientesCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Total gastado</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{formatCLP(totalProyecto)}</p>
        </div>
      </div>

      {/* Galería de boletas */}
      {gastos.length > 0 && (
        <div className="px-4 pt-4 pb-2 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Boletas escaneadas ({gastos.length})
          </p>
          <div className="grid grid-cols-3 gap-2">
            {gastos.map((g) => <GaleriaThumbnail key={g.id} gasto={g} />)}
          </div>
        </div>
      )}

      {/* Panel de filtros */}
      <div className="px-4 py-3 border-b border-gray-100 space-y-3">
        {/* Filtro Etapa */}
        {etapas.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Etapa</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              <button
                onClick={() => { setFiltroEtapa(null); setFiltroPartida(null) }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${!filtroEtapa ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}
              >Todas</button>
              {etapas.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setFiltroEtapa((prev) => e.id === prev ? null : e.id); setFiltroPartida(null) }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filtroEtapa === e.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}
                >{e.nombre}</button>
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
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${!filtroPartida ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}
              >Todas</button>
              {partidasDisponibles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFiltroPartida((prev) => p.id === prev ? null : p.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filtroPartida === p.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}
                >{p.nombre}</button>
              ))}
            </div>
          </div>
        )}

        {/* Filtro Etiquetas */}
        {etiquetasUnicas.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Etiquetas</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-none flex-wrap">
              {etiquetasUnicas.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleEtiqueta(tag)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${filtrosEtiqueta.includes(tag) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}
                >{tag}</button>
              ))}
            </div>
          </div>
        )}

        {/* Filtro Fecha */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Fecha</p>
          <div className="flex gap-2">
            <input
              type="date"
              value={filtroFechaDesde}
              onChange={(e) => setFiltroFechaDesde(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white"
            />
            <input
              type="date"
              value={filtroFechaHasta}
              onChange={(e) => setFiltroFechaHasta(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white"
            />
          </div>
        </div>

        {hayFiltros && (
          <button onClick={limpiarFiltros} className="text-xs text-blue-600 font-medium">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Lista de resultados */}
      <div className="px-4 py-4 space-y-3">
        {hayFiltros ? (
          <>
            <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
              <p className="text-xs text-gray-500">{itemsFiltrados.length} ítem{itemsFiltrados.length !== 1 ? 's' : ''} encontrado{itemsFiltrados.length !== 1 ? 's' : ''}</p>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Subtotal filtrado</p>
                <p className="text-sm font-bold text-gray-900">{formatCLP(subtotalFiltrado)}</p>
              </div>
            </div>
            {itemsFiltrados.length === 0 ? <Vacio /> : itemsFiltrados.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-100 p-4">
                {confirmandoEliminarItem === item.id && (
                  <div className="flex items-center justify-between gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
                    <span className="text-xs text-red-600 font-medium">¿Eliminar ítem?</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => handleEliminarItem(item, item.gasto.id)} className="text-xs font-semibold text-red-600">Sí</button>
                      <button onClick={() => setConfirmandoEliminarItem(null)} className="text-xs font-medium text-gray-400">No</button>
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 flex-1">{item.descripcion}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-sm font-bold text-gray-900">{formatCLP(item.subtotal)}</p>
                    {puedeEditarItems && (
                      <button
                        onClick={() => setItemEditando(item)}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                    {puedeEliminarGasto && (
                      <button
                        onClick={() => setConfirmandoEliminarItem(item.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{item.cantidad} {item.unidad}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.etiquetas.map((tag) => (
                    <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${filtrosEtiqueta.includes(tag) ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{tag}</span>
                  ))}
                </div>
                <p className="text-[10px] text-gray-300 mt-2">{item.gasto.proveedor} · {formatFecha(item.gasto.fecha_boleta)}</p>
                {item.gasto.creado_por_email && (
                  <p className="text-[10px] text-gray-300 mt-0.5">Registrado por {item.gasto.creado_por_email}</p>
                )}
                {item.gasto.comentario && (
                  <p className="text-[10px] text-gray-400 italic mt-0.5">💬 {item.gasto.comentario}</p>
                )}
              </div>
            ))}
          </>
        ) : (
          gastos.length === 0 ? <Vacio /> : gastos.map((gasto) => (
            <div key={gasto.id} className="rounded-xl border border-gray-100 p-4">
              {confirmandoEliminar === gasto.id ? (
                <div className="flex items-center justify-between gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
                  <span className="text-xs text-red-600 font-medium">¿Eliminar boleta?</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => handleEliminarGasto(gasto.id)} className="text-xs font-semibold text-red-600">Sí</button>
                    <button onClick={() => setConfirmandoEliminar(null)} className="text-xs font-medium text-gray-400">No</button>
                  </div>
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{gasto.proveedor}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatFecha(gasto.fecha_boleta)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-sm font-bold text-gray-900">{formatCLP(gasto.total)}</p>
                  {puedeEliminarGasto && confirmandoEliminar !== gasto.id && (
                    <button
                      onClick={() => setConfirmandoEliminar(gasto.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {(gasto.creado_por_email || gasto.comentario) && (
                <div className="mt-1.5">
                  {gasto.creado_por_email && (
                    <p className="text-[10px] text-gray-300">Registrado por {gasto.creado_por_email}</p>
                  )}
                  {gasto.comentario && (
                    <p className="text-[10px] text-gray-400 italic mt-0.5">💬 {gasto.comentario}</p>
                  )}
                </div>
              )}
              {(gasto.items ?? []).length > 0 && (
                <div className="mt-2 space-y-1">
                  {(gasto.items ?? []).map((item) => (
                    confirmandoEliminarItem === item.id ? (
                      <div key={item.id} className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                        <span className="text-xs text-red-600 font-medium">¿Eliminar ítem?</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => handleEliminarItem(item, gasto.id)} className="text-xs font-semibold text-red-600">Sí</button>
                          <button onClick={() => setConfirmandoEliminarItem(null)} className="text-xs font-medium text-gray-400">No</button>
                        </div>
                      </div>
                    ) : (
                      <div key={item.id} className="flex items-center justify-between text-xs text-gray-500">
                        <span className="truncate flex-1">{item.descripcion}</span>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span>{formatCLP(item.subtotal)}</span>
                          {puedeEditarItems && (
                            <button
                              onClick={() => setItemEditando(item)}
                              className="text-gray-300 hover:text-blue-500 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {puedeEliminarGasto && (
                            <button
                              onClick={() => setConfirmandoEliminarItem(item.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {Array.from(new Set((gasto.items ?? []).flatMap((i) => i.etiquetas))).map((tag) => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">{tag}</span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Botón exportar */}
      {puedeExportar && (
        <div className="px-4 pb-6 pt-2">
          <button
            onClick={handleExportar}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white rounded-xl py-3.5 text-sm font-semibold"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar Excel — {proyecto.nombre}
          </button>
        </div>
      )}

      {/* Modal de edición de clasificación */}
      {itemEditando && (
        <ClasificacionModal
          item={itemEditando}
          proyectoId={id}
          etapas={etapas}
          partidas={partidas}
          etiquetasSugeridas={etiquetasUnicas}
          puedeEtiquetar={usuarioActual ? tienePermiso(usuarioActual, overrides, 'tag_items') : false}
          onGuardado={handleItemGuardado}
          onCerrar={() => setItemEditando(null)}
        />
      )}
    </div>
  )
}

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
      {expandido && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={() => setExpandido(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-[390px] flex flex-col" style={{ maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <p className="text-sm font-semibold text-gray-900">{gasto.proveedor}</p>
                <p className="text-xs text-gray-400 mt-0.5">RUT {gasto.rut_proveedor} · {gasto.fecha_boleta}</p>
                <p className="text-base font-bold text-gray-900 mt-1">{formatCLP(gasto.total)}</p>
                {gasto.creado_por_email && (
                  <p className="text-[10px] text-gray-400 mt-1">Registrado por {gasto.creado_por_email}</p>
                )}
                {gasto.comentario && (
                  <p className="text-xs text-gray-500 italic mt-1">💬 {gasto.comentario}</p>
                )}
              </div>
              <div className="flex flex-col gap-2 items-end shrink-0 ml-3">
                {gasto.imagen_url && (
                  <a href={gasto.imagen_url} download={`boleta-${gasto.proveedor}.jpg`} className="flex items-center gap-1 bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg" onClick={(e) => e.stopPropagation()}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Descargar
                  </a>
                )}
                <button onClick={() => setExpandido(false)} className="text-xs text-gray-400 px-3 py-1.5 border border-gray-200 rounded-lg">Cerrar</button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {gasto.imagen_url ? (
                <img src={gasto.imagen_url} alt={gasto.proveedor} className="w-full" />
              ) : (
                <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-5xl">🧾</div>
              )}
            </div>
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

function formatFecha(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}
