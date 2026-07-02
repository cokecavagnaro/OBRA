'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getObras, createObra, updateObraPrompt, getEtapas, createEtapa, getPartidas, createPartida } from '@/lib/supabase/db'
import type { Obra, Etapa, Partida } from '@/lib/types'

export default function Config() {
  const [obras, setObras] = useState<Obra[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [partidas, setPartidas] = useState<Partida[]>([])
  const [loading, setLoading] = useState(true)

  const [obraSeleccionada, setObraSeleccionada] = useState<Obra | null>(null)
  const [editandoPrompt, setEditandoPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')

  const [nuevaEtapa, setNuevaEtapa] = useState('')
  const [nuevaPartida, setNuevaPartida] = useState('')
  const [etapaParaPartida, setEtapaParaPartida] = useState<string>('')

  const [nuevaObra, setNuevaObra] = useState('')
  const [creandoObra, setCreandoObra] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    getObras().then((data) => {
      setObras(data)
      setLoading(false)
    })
  }, [])

  async function seleccionar(obra: Obra) {
    setObraSeleccionada(obra)
    setEditandoPrompt(false)
    setNuevaEtapa('')
    setNuevaPartida('')
    setEtapaParaPartida('')
    const [e, p] = await Promise.all([getEtapas(obra.id), getPartidas(obra.id)])
    setEtapas(e)
    setPartidas(p)
  }

  async function guardarPrompt() {
    if (!obraSeleccionada) return
    await updateObraPrompt(obraSeleccionada.id, promptDraft)
    setObras((prev) => prev.map((o) => o.id === obraSeleccionada.id ? { ...o, system_prompt: promptDraft } : o))
    setObraSeleccionada((prev) => prev ? { ...prev, system_prompt: promptDraft } : null)
    setEditandoPrompt(false)
  }

  async function agregarEtapa() {
    if (!obraSeleccionada || !nuevaEtapa.trim()) return
    setGuardando(true)
    const nueva = await createEtapa(obraSeleccionada.id, nuevaEtapa.trim(), etapas.length + 1)
    if (nueva) setEtapas((prev) => [...prev, nueva])
    setNuevaEtapa('')
    setGuardando(false)
  }

  async function agregarPartida() {
    if (!obraSeleccionada || !nuevaPartida.trim()) return
    setGuardando(true)
    const nueva = await createPartida(obraSeleccionada.id, nuevaPartida.trim(), etapaParaPartida || undefined)
    if (nueva) setPartidas((prev) => [...prev, nueva])
    setNuevaPartida('')
    setGuardando(false)
  }

  async function crearObra() {
    if (!nuevaObra.trim()) return
    setGuardando(true)
    const nueva = await createObra(nuevaObra.trim())
    if (nueva) {
      setObras((prev) => [...prev, nueva])
      setNuevaObra('')
      setCreandoObra(false)
      seleccionar(nueva)
    }
    setGuardando(false)
  }

  async function handleCerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const etapasFiltradas = etapas.filter((e) => e.obra_id === obraSeleccionada?.id)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
            <p className="text-xs text-gray-400 mt-0.5">Obras, etapas y partidas</p>
          </div>
          <button onClick={handleCerrarSesion} className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5">
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Lista de obras */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Obras</p>
            <button onClick={() => setCreandoObra(true)} className="text-xs font-medium text-blue-600">
              + Nueva obra
            </button>
          </div>

          {creandoObra && (
            <div className="flex gap-2 mb-2">
              <input
                autoFocus
                type="text"
                value={nuevaObra}
                onChange={(e) => setNuevaObra(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && crearObra()}
                placeholder="Nombre de la obra"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={crearObra} disabled={guardando} className="bg-blue-600 text-white px-3 rounded-lg text-sm font-medium disabled:opacity-40">Crear</button>
              <button onClick={() => setCreandoObra(false)} className="text-gray-400 px-2 text-sm">✕</button>
            </div>
          )}

          <div className="space-y-1.5">
            {obras.length === 0 && !creandoObra && (
              <p className="text-xs text-gray-300 italic py-2">Sin obras — crea la primera</p>
            )}
            {obras.map((obra) => (
              <button
                key={obra.id}
                onClick={() => seleccionar(obra)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  obraSeleccionada?.id === obra.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{obra.nombre}</p>
                {obra.system_prompt ? (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{obra.system_prompt}</p>
                ) : (
                  <p className="text-xs text-gray-300 mt-0.5 italic">Sin instrucciones</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Detalle de obra seleccionada */}
        {obraSeleccionada && (
          <>
            {/* System prompt */}
            <div className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Instrucciones de IA</p>
                {!editandoPrompt && (
                  <button
                    onClick={() => { setEditandoPrompt(true); setPromptDraft(obraSeleccionada.system_prompt) }}
                    className="text-xs text-blue-600 font-medium"
                  >
                    ✏ Editar
                  </button>
                )}
              </div>
              {editandoPrompt ? (
                <>
                  <textarea
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    rows={5}
                    placeholder="Ej: El hormigón siempre va a Fundaciones aunque no se indique..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setEditandoPrompt(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-xs text-gray-500">Cancelar</button>
                    <button onClick={guardarPrompt} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-xs font-semibold">Guardar</button>
                  </div>
                </>
              ) : (
                <p className={`text-sm leading-relaxed ${obraSeleccionada.system_prompt ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                  {obraSeleccionada.system_prompt || 'Sin instrucciones definidas'}
                </p>
              )}
            </div>

            {/* Etapas */}
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Etapas</p>
              <div className="space-y-1.5 mb-3">
                {etapasFiltradas.length === 0 && <p className="text-xs text-gray-300 italic">Sin etapas</p>}
                {etapasFiltradas.map((etapa) => (
                  <p key={etapa.id} className="text-sm text-gray-700 py-1 border-b border-gray-50 last:border-0">{etapa.nombre}</p>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevaEtapa}
                  onChange={(e) => setNuevaEtapa(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && agregarEtapa()}
                  placeholder="Nueva etapa..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <button onClick={agregarEtapa} disabled={guardando} className="bg-gray-900 text-white px-3 rounded-lg text-sm font-medium disabled:opacity-40">+</button>
              </div>
            </div>

            {/* Partidas */}
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Partidas</p>

              <div className="space-y-1.5 mb-3">
                {partidas.filter((p) => p.obra_id === obraSeleccionada.id).length === 0 && (
                  <p className="text-xs text-gray-300 italic">Sin partidas</p>
                )}
                {partidas.filter((p) => p.obra_id === obraSeleccionada.id).map((p) => {
                  const etapa = etapas.find((e) => e.id === p.etapa_id)
                  return (
                    <div key={p.id} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                      <p className="text-sm text-gray-700">{p.nombre}</p>
                      <span className="text-xs text-gray-400">{etapa?.nombre ?? '—'}</span>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] text-gray-400">Etapa (opcional)</p>
                <select
                  value={etapaParaPartida}
                  onChange={(e) => setEtapaParaPartida(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Sin etapa</option>
                  {etapasFiltradas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nuevaPartida}
                    onChange={(e) => setNuevaPartida(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && agregarPartida()}
                    placeholder="Nueva partida..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <button onClick={agregarPartida} disabled={guardando} className="bg-gray-900 text-white px-3 rounded-lg text-sm font-medium disabled:opacity-40">+</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
