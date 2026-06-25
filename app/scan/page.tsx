'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { OBRAS_MOCK, ETAPAS_MOCK, PARTIDAS_MOCK, formatCLP } from '@/lib/mock'
import type { Obra, Etapa, Partida, ItemAnalizado } from '@/lib/types'
import SystemPromptBox from '@/components/SystemPromptBox'
import ItemCard from '@/components/ItemCard'

type Paso = 1 | 2 | 3

// Items mock para el paso 3
const ITEMS_DEMO: ItemAnalizado[] = [
  { descripcion: 'Pintura látex blanca 20L', cantidad: 4, unidad: 'un', precio_unitario: 28990, subtotal: 115960, categoria: 'Pinturas', etiquetas: ['pintura', 'látex'], confianza: 0.95 },
  { descripcion: 'Rodillo lana 23cm', cantidad: 2, unidad: 'un', precio_unitario: 4990, subtotal: 9980, categoria: 'Herramientas', etiquetas: ['pintura'], confianza: 0.88 },
  { descripcion: 'Elemento no identificado', cantidad: 1, unidad: 'gl', precio_unitario: 5500, subtotal: 5500, categoria: 'Sin clasificar', etiquetas: [], confianza: 0.45 },
]

export default function Scan() {
  const router = useRouter()
  const [paso, setPaso] = useState<Paso>(1)

  // Paso 1
  const [obra, setObra] = useState<Obra | null>(null)
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  const [partida, setPartida] = useState<Partida | null>(null)
  const [contexto, setContexto] = useState('')

  // Paso 2
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [analizando, setAnalizando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Paso 3
  const [items, setItems] = useState<ItemAnalizado[]>(ITEMS_DEMO)
  const [checked, setChecked] = useState<boolean[]>(ITEMS_DEMO.map((i) => i.confianza >= 0.7))
  const [proveedor] = useState('Sodimac Quilicura')
  const [rut] = useState('96.928.180-5')
  const [fecha] = useState('2024-06-10')

  const etapasFiltradas = ETAPAS_MOCK.filter((e) => e.obra_id === obra?.id)
  const partidasFiltradas = PARTIDAS_MOCK.filter((p) => p.etapa_id === etapa?.id)
  const paso1Completo = obra && etapa && partida

  const totalConfirmado = items.reduce((sum, item, i) => checked[i] ? sum + item.subtotal : sum, 0)

  function handleObraChange(id: string) {
    const o = OBRAS_MOCK.find((x) => x.id === id) ?? null
    setObra(o)
    setEtapa(null)
    setPartida(null)
  }

  function handleEtapaChange(id: string) {
    const e = ETAPAS_MOCK.find((x) => x.id === id) ?? null
    setEtapa(e)
    setPartida(null)
  }

  function handleCaptura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setImagenPreview(url)
  }

  function handleAnalizar() {
    setAnalizando(true)
    setTimeout(() => {
      setAnalizando(false)
      setItems(ITEMS_DEMO)
      setChecked(ITEMS_DEMO.map((i) => i.confianza >= 0.7))
      setPaso(3)
    }, 2000)
  }

  function toggleItem(i: number) {
    setChecked((prev) => prev.map((v, idx) => idx === i ? !v : v))
  }

  function addTag(i: number, tag: string) {
    setItems((prev) => prev.map((item, idx) =>
      idx === i ? { ...item, etiquetas: [...item.etiquetas, tag] } : item
    ))
  }

  function removeTag(i: number, tag: string) {
    setItems((prev) => prev.map((item, idx) =>
      idx === i ? { ...item, etiquetas: item.etiquetas.filter((t) => t !== tag) } : item
    ))
  }

  function handleGuardar() {
    // TODO: guardar en Supabase
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header con pasos */}
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => paso > 1 ? setPaso((paso - 1) as Paso) : router.push('/')} className="text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-gray-900">
            {paso === 1 ? 'Contexto de la boleta' : paso === 2 ? 'Fotografiar boleta' : 'Revisar ítems'}
          </h2>
          <span className="text-xs text-gray-400">{paso}/3</span>
        </div>

        {/* Barra de progreso */}
        <div className="flex gap-1">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1 flex-1 rounded-full transition-colors ${n <= paso ? 'bg-blue-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>
      </div>

      {/* Paso 1 — Contexto */}
      {paso === 1 && (
        <div className="px-4 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Obra</label>
            <select
              value={obra?.id ?? ''}
              onChange={(e) => handleObraChange(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white"
            >
              <option value="">Seleccionar obra...</option>
              {OBRAS_MOCK.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>

          {obra && <SystemPromptBox obra={obra} />}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Etapa</label>
            <select
              value={etapa?.id ?? ''}
              onChange={(e) => handleEtapaChange(e.target.value)}
              disabled={!obra}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white disabled:opacity-40"
            >
              <option value="">Seleccionar etapa...</option>
              {etapasFiltradas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Partida</label>
            <select
              value={partida?.id ?? ''}
              onChange={(e) => setPartida(PARTIDAS_MOCK.find((p) => p.id === e.target.value) ?? null)}
              disabled={!etapa}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white disabled:opacity-40"
            >
              <option value="">Seleccionar partida...</option>
              {partidasFiltradas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Contexto específico <span className="text-gray-300 font-normal">(opcional)</span>
            </label>
            <textarea
              value={contexto}
              onChange={(e) => setContexto(e.target.value)}
              placeholder="Ej: Las planchas de OSB de esta boleta son para el baño del piso 2"
              rows={3}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 resize-none placeholder-gray-300"
            />
          </div>

          <button
            onClick={() => setPaso(2)}
            disabled={!paso1Completo}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Paso 2 — Captura */}
      {paso === 2 && (
        <div className="px-4 py-5 space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCaptura}
            className="hidden"
          />

          {!imagenPreview ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full h-64 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-3 text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors"
            >
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-medium">Fotografiar boleta</span>
              <span className="text-xs">Toca para abrir la cámara</span>
            </button>
          ) : (
            <div className="relative">
              <img src={imagenPreview} alt="Boleta capturada" className="w-full rounded-2xl object-cover max-h-72" />
              <button
                onClick={() => setImagenPreview(null)}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>
          )}

          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border border-gray-200 rounded-xl py-2.5 text-sm text-gray-500 font-medium"
          >
            Subir desde galería
          </button>

          <button
            onClick={handleAnalizar}
            disabled={!imagenPreview || analizando}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {analizando ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analizando con IA...
              </>
            ) : (
              'Analizar con IA'
            )}
          </button>
        </div>
      )}

      {/* Paso 3 — Revisión */}
      {paso === 3 && (
        <div className="px-4 py-5 space-y-4">
          {/* Datos del proveedor */}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Proveedor extraído</p>
            <p className="text-sm font-semibold text-gray-900">{proveedor}</p>
            <p className="text-xs text-gray-400">RUT {rut} · {fecha}</p>
          </div>

          {obra && <SystemPromptBox obra={obra} />}

          {/* Items */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ítems extraídos</p>
            <div className="space-y-2">
              {items.map((item, i) => (
                <ItemCard
                  key={i}
                  item={item}
                  checked={checked[i]}
                  onToggle={() => toggleItem(i)}
                  onTagAdd={(tag) => addTag(i, tag)}
                  onTagRemove={(tag) => removeTag(i, tag)}
                />
              ))}
            </div>
          </div>

          {/* Total confirmado */}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">Total confirmado</span>
            <span className="text-lg font-bold text-gray-900">{formatCLP(totalConfirmado)}</span>
          </div>

          <button
            onClick={handleGuardar}
            className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-semibold"
          >
            Guardar boleta
          </button>
        </div>
      )}
    </div>
  )
}
