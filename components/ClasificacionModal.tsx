'use client'

import { useState } from 'react'
import { createEtapa, createPartida, updateItemGasto, upsertClasificacionAprendida } from '@/lib/supabase/db'
import { formatCLP } from '@/lib/mock'
import { descuentoDeItem } from '@/lib/confianzaDocumento'
import type { ItemGasto, Etapa, Partida } from '@/lib/types'

interface Props {
  item: ItemGasto
  proyectoId: string
  etapas: Etapa[]
  partidas: Partida[]
  etiquetasSugeridas: string[]
  puedeEtiquetar?: boolean
  onGuardado: (item: ItemGasto, nuevasEtapas: Etapa[], nuevasPartidas: Partida[], nuevoTotalGasto?: number) => void
  onCerrar: () => void
}

export default function ClasificacionModal({
  item,
  proyectoId,
  etapas: etapasIniciales,
  partidas: partidasIniciales,
  etiquetasSugeridas,
  puedeEtiquetar = true,
  onGuardado,
  onCerrar,
}: Props) {
  const [etapas, setEtapas] = useState<Etapa[]>(etapasIniciales)
  const [partidas, setPartidas] = useState<Partida[]>(partidasIniciales)

  const [etapaId, setEtapaId] = useState<string>(item.etapa_id ?? '')
  const [partidaId, setPartidaId] = useState<string>(item.partida_id ?? '')
  const [etiquetas, setEtiquetas] = useState<string[]>(item.etiquetas)
  const [cantidad, setCantidad] = useState<number>(item.cantidad)
  const [precioUnitario, setPrecioUnitario] = useState<number>(item.precio_unitario)
  const subtotal = cantidad * precioUnitario

  const [comentarioCambio, setComentarioCambio] = useState('')

  const [tagInput, setTagInput] = useState('')
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)

  const [creandoEtapa, setCreandoEtapa] = useState(false)
  const [nuevaEtapaNombre, setNuevaEtapaNombre] = useState('')
  const [creandoPartida, setCreandoPartida] = useState(false)
  const [nuevaPartidaNombre, setNuevaPartidaNombre] = useState('')

  const [guardando, setGuardando] = useState(false)

  const sugerenciasFiltradas = etiquetasSugeridas.filter(
    (t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !etiquetas.includes(t)
  )

  function addTag(tag: string) {
    const t = tag.toLowerCase().trim()
    if (t && !etiquetas.includes(t)) setEtiquetas((prev) => [...prev, t])
    setTagInput('')
    setMostrarSugerencias(false)
  }

  function removeTag(tag: string) {
    setEtiquetas((prev) => prev.filter((t) => t !== tag))
  }

  function handleTagKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && tagInput.trim()) { addTag(tagInput); e.preventDefault() }
  }

  async function handleCrearEtapa() {
    if (!nuevaEtapaNombre.trim()) return
    const nueva = await createEtapa(proyectoId, nuevaEtapaNombre.trim(), etapas.length + 1)
    if (nueva) {
      setEtapas((prev) => [...prev, nueva])
      setEtapaId(nueva.id)
    }
    setCreandoEtapa(false)
    setNuevaEtapaNombre('')
  }

  async function handleCrearPartida() {
    if (!nuevaPartidaNombre.trim()) return
    const nueva = await createPartida(proyectoId, nuevaPartidaNombre.trim(), etapaId || undefined)
    if (nueva) {
      setPartidas((prev) => [...prev, nueva])
      setPartidaId(nueva.id)
    }
    setCreandoPartida(false)
    setNuevaPartidaNombre('')
  }

  async function handleGuardar() {
    setGuardando(true)
    const { ok, nuevoTotal } = await updateItemGasto(item.id, {
      etapa_id: etapaId || null,
      partida_id: partidaId || null,
      etiquetas,
      cantidad,
      precio_unitario: precioUnitario,
      subtotal,
    }, comentarioCambio.trim() || undefined)
    if (ok) {
      if (etiquetas.length > 0) {
        await upsertClasificacionAprendida({
          proyecto_id: proyectoId,
          descripcion: item.descripcion,
          categoria: item.categoria,
          etiquetas,
        })
      }
      onGuardado({ ...item, etapa_id: etapaId, partida_id: partidaId, etiquetas, cantidad, precio_unitario: precioUnitario, subtotal }, etapas, partidas, nuevoTotal)
    }
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={onCerrar}>
      <div
        className="bg-white rounded-t-2xl w-full max-w-[390px] flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-gray-900">{item.descripcion}</p>
            <p className="text-xs text-gray-400 mt-0.5">{item.categoria}</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 ml-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">
          {/* Etapa y Partida */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Etapa</p>
                <button onClick={() => setCreandoEtapa(true)} className="text-[10px] text-blue-600 font-medium">+ Nueva</button>
              </div>
              {creandoEtapa ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={nuevaEtapaNombre}
                    onChange={(e) => setNuevaEtapaNombre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCrearEtapa()}
                    placeholder="Nombre..."
                    className="flex-1 border border-blue-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 min-w-0"
                  />
                  <button onClick={handleCrearEtapa} className="bg-blue-600 text-white rounded-lg px-2 text-xs font-bold">✓</button>
                  <button onClick={() => { setCreandoEtapa(false); setNuevaEtapaNombre('') }} className="text-gray-400 text-xs px-1">✕</button>
                </div>
              ) : (
                <select
                  value={etapaId}
                  onChange={(e) => { setEtapaId(e.target.value); setPartidaId('') }}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white"
                >
                  <option value="">Sin etapa</option>
                  {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Partida</p>
                <button onClick={() => setCreandoPartida(true)} className="text-[10px] text-blue-600 font-medium">+ Nueva</button>
              </div>
              {creandoPartida ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={nuevaPartidaNombre}
                    onChange={(e) => setNuevaPartidaNombre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCrearPartida()}
                    placeholder="Nombre..."
                    className="flex-1 border border-blue-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 min-w-0"
                  />
                  <button onClick={handleCrearPartida} className="bg-blue-600 text-white rounded-lg px-2 text-xs font-bold">✓</button>
                  <button onClick={() => { setCreandoPartida(false); setNuevaPartidaNombre('') }} className="text-gray-400 text-xs px-1">✕</button>
                </div>
              ) : (
                <select
                  value={partidaId}
                  onChange={(e) => setPartidaId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white"
                >
                  <option value="">Sin partida</option>
                  {(etapaId ? partidas.filter((p) => !p.etapa_id || p.etapa_id === etapaId) : partidas).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Montos */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-xl p-2 text-center border border-gray-100">
              <p className="text-[10px] text-gray-400">Cantidad</p>
              <div className="flex items-center justify-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(Number(e.target.value))}
                  className="w-12 text-sm font-bold text-gray-900 text-right outline-none border border-gray-200 rounded-lg px-1 bg-white focus:border-blue-400"
                />
                <span className="text-sm font-bold text-gray-900">{item.unidad}</span>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-2 text-center border border-gray-100">
              <p className="text-[10px] text-gray-400">Precio unit.</p>
              <input
                type="number"
                inputMode="decimal"
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(Number(e.target.value))}
                className="w-full text-sm font-bold text-gray-900 text-center outline-none border border-gray-200 rounded-lg px-1 bg-white focus:border-blue-400"
              />
            </div>
            <div className="bg-blue-50 rounded-xl p-2 text-center border border-blue-100">
              <p className="text-[10px] text-blue-400">Subtotal</p>
              <p className="text-sm font-bold text-blue-700">{formatCLP(subtotal)}</p>
            </div>
          </div>

          {(() => {
            const descuento = descuentoDeItem(item)
            if (!descuento) return null
            return (
              <p className="text-[10px] text-gray-400 -mt-3">
                Descuento aplicado: -{formatCLP(descuento.monto)} (antes {formatCLP(descuento.antes)})
              </p>
            )
          })()}

          {/* Etiquetas */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Etiquetas</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {etiquetas.map((tag) => (
                <button
                  key={tag}
                  onClick={() => removeTag(tag)}
                  disabled={!puedeEtiquetar}
                  className="flex items-center gap-1 bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-medium hover:bg-red-500 transition-colors disabled:opacity-60"
                >
                  {tag} ×
                </button>
              ))}
              {etiquetas.length === 0 && (
                <span className="text-xs text-gray-400 italic">Sin etiquetas</span>
              )}
            </div>
            {puedeEtiquetar && (
              <div className="relative">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setMostrarSugerencias(true) }}
                  onKeyDown={handleTagKey}
                  onFocus={() => setMostrarSugerencias(true)}
                  placeholder="+ Agregar etiqueta..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 placeholder-gray-300 outline-none focus:border-blue-300"
                />
                {mostrarSugerencias && sugerenciasFiltradas.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {sugerenciasFiltradas.map((t) => (
                      <button
                        key={t}
                        onMouseDown={() => addTag(t)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 border-b border-gray-50 last:border-0"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {puedeEtiquetar && tagInput.trim() && (
              <button
                onClick={() => addTag(tagInput)}
                className="mt-1.5 text-xs text-blue-600 font-medium px-2"
              >
                + Crear etiqueta &quot;{tagInput.trim()}&quot;
              </button>
            )}
          </div>

          {/* Comentario del cambio */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Comentario del cambio (opcional)</p>
            <textarea
              value={comentarioCambio}
              onChange={(e) => setComentarioCambio(e.target.value)}
              placeholder="Ej: se corrigió el precio, la IA leyó mal la boleta"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 resize-none placeholder-gray-300"
            />
          </div>
        </div>

        {/* Guardar */}
        <div className="px-4 pt-3 border-t border-gray-100 shrink-0" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px) + 64px)' }}>
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="w-full bg-blue-600 text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar clasificación'}
          </button>
        </div>
      </div>
    </div>
  )
}
