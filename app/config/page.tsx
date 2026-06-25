'use client'

import { useState } from 'react'
import { OBRAS_MOCK, ETAPAS_MOCK, PARTIDAS_MOCK } from '@/lib/mock'
import type { Obra, Etapa, Partida } from '@/lib/types'

export default function Config() {
  const [obras, setObras] = useState<Obra[]>(OBRAS_MOCK)
  const [etapas, setEtapas] = useState<Etapa[]>(ETAPAS_MOCK)
  const [partidas, setPartidas] = useState<Partida[]>(PARTIDAS_MOCK)

  const [obraSeleccionada, setObraSeleccionada] = useState<Obra | null>(null)
  const [editandoPrompt, setEditandoPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')

  const [nuevaEtapa, setNuevaEtapa] = useState('')
  const [nuevaPartida, setNuevaPartida] = useState('')
  const [etapaParaPartida, setEtapaParaPartida] = useState<string>('')

  const [nuevaObra, setNuevaObra] = useState('')
  const [creandoObra, setCreandoObra] = useState(false)

  function seleccionar(obra: Obra) {
    setObraSeleccionada(obra)
    setEditandoPrompt(false)
    setNuevaEtapa('')
    setNuevaPartida('')
  }

  function guardarPrompt() {
    if (!obraSeleccionada) return
    setObras((prev) => prev.map((o) => o.id === obraSeleccionada.id ? { ...o, system_prompt: promptDraft } : o))
    setObraSeleccionada((prev) => prev ? { ...prev, system_prompt: promptDraft } : null)
    setEditandoPrompt(false)
  }

  function agregarEtapa() {
    if (!obraSeleccionada || !nuevaEtapa.trim()) return
    const nueva: Etapa = {
      id: Date.now().toString(),
      obra_id: obraSeleccionada.id,
      nombre: nuevaEtapa.trim(),
      orden: etapasFiltradas.length + 1,
    }
    setEtapas((prev) => [...prev, nueva])
    setNuevaEtapa('')
  }

  function agregarPartida() {
    if (!etapaParaPartida || !nuevaPartida.trim()) return
    const nueva: Partida = {
      id: Date.now().toString(),
      etapa_id: etapaParaPartida,
      nombre: nuevaPartida.trim(),
    }
    setPartidas((prev) => [...prev, nueva])
    setNuevaPartida('')
  }

  function crearObra() {
    if (!nuevaObra.trim()) return
    const nueva: Obra = {
      id: Date.now().toString(),
      nombre: nuevaObra.trim(),
      system_prompt: '',
      created_at: new Date().toISOString(),
    }
    setObras((prev) => [...prev, nueva])
    setNuevaObra('')
    setCreandoObra(false)
    setObraSeleccionada(nueva)
  }

  const etapasFiltradas = etapas.filter((e) => e.obra_id === obraSeleccionada?.id)

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
        <p className="text-xs text-gray-400 mt-0.5">Obras, etapas y partidas</p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Lista de obras */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Obras</p>
            <button
              onClick={() => setCreandoObra(true)}
              className="text-xs font-medium text-blue-600"
            >
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
              <button onClick={crearObra} className="bg-blue-600 text-white px-3 rounded-lg text-sm font-medium">Crear</button>
              <button onClick={() => setCreandoObra(false)} className="text-gray-400 px-2 text-sm">✕</button>
            </div>
          )}

          <div className="space-y-1.5">
            {obras.map((obra) => (
              <button
                key={obra.id}
                onClick={() => seleccionar(obra)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  obraSeleccionada?.id === obra.id
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-100 hover:border-gray-200'
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
              <div className="space-y-2 mb-3">
                {etapasFiltradas.map((etapa) => (
                  <div key={etapa.id} className="flex items-center justify-between">
                    <p className="text-sm text-gray-700">{etapa.nombre}</p>
                    <div className="flex flex-wrap gap-1">
                      {partidas.filter((p) => p.etapa_id === etapa.id).map((p) => (
                        <span key={p.id} className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full">
                          {p.nombre}
                        </span>
                      ))}
                    </div>
                  </div>
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
                <button onClick={agregarEtapa} className="bg-gray-900 text-white px-3 rounded-lg text-sm font-medium">+</button>
              </div>
            </div>

            {/* Partidas */}
            {etapasFiltradas.length > 0 && (
              <div className="rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Agregar partida</p>
                <select
                  value={etapaParaPartida}
                  onChange={(e) => setEtapaParaPartida(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2"
                >
                  <option value="">Seleccionar etapa...</option>
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
                  <button onClick={agregarPartida} className="bg-gray-900 text-white px-3 rounded-lg text-sm font-medium">+</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
