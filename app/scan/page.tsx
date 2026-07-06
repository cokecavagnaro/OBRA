'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCLP } from '@/lib/mock'
import { getObras, getEtapas, getPartidas, saveGasto, createEtapa, createPartida, upsertClasificacionAprendida, getUsuarioActual, getPermisosOverrides } from '@/lib/supabase/db'
import { normalizarImagenParaSubida } from '@/lib/imagen'
import { tienePermiso } from '@/lib/permisos'
import type { Obra, Etapa, Partida, ItemAnalizado, Usuario, PermissionOverride } from '@/lib/types'
import SystemPromptBox from '@/components/SystemPromptBox'

type Paso = 1 | 2 | 3

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
  const [imagenDataUrl, setImagenDataUrl] = useState<string>('')
  const [analizando, setAnalizando] = useState(false)
  const [procesandoImagen, setProcesandoImagen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileGaleriaRef = useRef<HTMLInputElement>(null)

  // Paso 3 — one item at a time
  const [items, setItems] = useState<ItemAnalizado[]>(ITEMS_DEMO)
  const [itemActual, setItemActual] = useState(0)
  const [tagInput, setTagInput] = useState('')
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [proveedor, setProveedor] = useState('Sodimac Quilicura')
  const [rut, setRut] = useState('96.928.180-5')
  const [fecha, setFecha] = useState('2024-06-10')
  const [totalBoleta, setTotalBoleta] = useState(0)

  const [obras, setObras] = useState<Obra[]>([])
  const [etapasFiltradas, setEtapasFiltradas] = useState<Etapa[]>([])
  const [partidasFiltradas, setPartidasFiltradas] = useState<Partida[]>([])

  // Creación inline en paso 3
  const [creandoEtapaInline, setCreandoEtapaInline] = useState(false)
  const [nuevaEtapaNombre, setNuevaEtapaNombre] = useState('')
  const [creandoPartidaInline, setCreandoPartidaInline] = useState(false)
  const [nuevaPartidaNombre, setNuevaPartidaNombre] = useState('')

  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null)
  const [overrides, setOverrides] = useState<PermissionOverride[]>([])
  const [permisosCargados, setPermisosCargados] = useState(false)
  const puedeEscanear = usuarioActual ? tienePermiso(usuarioActual, overrides, 'scan_receipts') : false

  useEffect(() => {
    getObras().then(setObras)
    getUsuarioActual().then(async (u) => {
      setUsuarioActual(u)
      if (u) setOverrides(await getPermisosOverrides(u.id))
      setPermisosCargados(true)
    })
  }, [])

  const paso1Completo = !!obra
  const tagsObra: string[] = []

  const item = items[itemActual]
  const esUltimo = itemActual === items.length - 1
  const confirmados = items.filter((i) => i.etiquetas.length > 0).length
  const pendientes = items.filter((i) => i.etiquetas.length === 0).length

  async function handleObraChange(id: string) {
    const o = obras.find((x) => x.id === id) ?? null
    setObra(o)
    setEtapa(null)
    setPartida(null)
    if (o) {
      const [e, p] = await Promise.all([getEtapas(o.id), getPartidas(o.id)])
      setEtapasFiltradas(e)
      setPartidasFiltradas(p)
    } else {
      setEtapasFiltradas([])
      setPartidasFiltradas([])
    }
  }

  function handleEtapaChange(id: string) {
    const e = etapasFiltradas.find((x) => x.id === id) ?? null
    setEtapa(e)
    setPartida(null)
  }

  function setItemEtapa(etapaId: string) {
    setItems((prev) => prev.map((x, idx) =>
      idx === itemActual ? { ...x, etapa_id: etapaId, partida_id: '' } : x
    ))
  }

  function setItemPartida(partidaId: string) {
    setItems((prev) => prev.map((x, idx) =>
      idx === itemActual ? { ...x, partida_id: partidaId } : x
    ))
  }

  function setItemCantidad(cantidad: number) {
    setItems((prev) => prev.map((x, idx) =>
      idx === itemActual ? { ...x, cantidad, subtotal: cantidad * x.precio_unitario } : x
    ))
  }

  function setItemPrecio(precio_unitario: number) {
    setItems((prev) => prev.map((x, idx) =>
      idx === itemActual ? { ...x, precio_unitario, subtotal: x.cantidad * precio_unitario } : x
    ))
  }

  const fileSeleccionadoRef = useRef<File | null>(null)

  async function handleCaptura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcesandoImagen(true)
    try {
      const { blob, dataUrl } = await normalizarImagenParaSubida(file)
      fileSeleccionadoRef.current = new File([blob], 'boleta.jpg', { type: 'image/jpeg' })
      setImagenPreview(dataUrl)
    } catch (err) {
      console.error('Error al procesar imagen:', err)
      fileSeleccionadoRef.current = file
      setImagenPreview(URL.createObjectURL(file))
    } finally {
      setProcesandoImagen(false)
    }
  }

  async function handleAnalizar() {
    const file = fileSeleccionadoRef.current
    if (!file || !obra) return

    setAnalizando(true)
    try {
      // Leer imagen como base64
      const { base64, dataUrl } = await new Promise<{ base64: string; dataUrl: string }>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve({ base64: result.split(',')[1], dataUrl: result })
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setImagenDataUrl(dataUrl)

      const res = await fetch('/api/analizar-boleta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagen_base64: base64,
          media_type: file.type || 'image/jpeg',
          obra_id: obra.id,
          contexto_boleta: contexto,
        }),
      })

      if (!res.ok) throw new Error('Error al analizar')

      const data = await res.json()
      const itemsResultado = data.items ?? []

      if (data.proveedor) setProveedor(data.proveedor)
      if (data.rut) setRut(data.rut)
      if (data.fecha) setFecha(data.fecha)
      if (data.total) setTotalBoleta(data.total)

      const base = itemsResultado.length > 0 ? itemsResultado : ITEMS_DEMO
      setItems(base.map((i: ItemAnalizado) => ({
        ...i,
        etapa_id: i.etapa_id ?? etapa?.id ?? '',
        partida_id: i.partida_id ?? partida?.id ?? '',
      })))
      setItemActual(0)
      setTagInput('')
      setPaso(3)
    } catch (err) {
      console.error(err)
      setItems(ITEMS_DEMO.map((i) => ({
        ...i,
        etapa_id: etapa?.id ?? '',
        partida_id: partida?.id ?? '',
      })))
      setItemActual(0)
      setTagInput('')
      setPaso(3)
    } finally {
      setAnalizando(false)
    }
  }

  function addTag(tag: string) {
    const t = tag.toLowerCase().trim()
    if (!t || item.etiquetas.includes(t)) return
    setItems((prev) => prev.map((x, idx) =>
      idx === itemActual ? { ...x, etiquetas: [...x.etiquetas, t] } : x
    ))
    setTagInput('')
    setMostrarSugerencias(false)
  }

  function removeTag(tag: string) {
    setItems((prev) => prev.map((x, idx) =>
      idx === itemActual ? { ...x, etiquetas: x.etiquetas.filter((t) => t !== tag) } : x
    ))
  }

  function handleTagKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && tagInput.trim()) {
      addTag(tagInput)
    }
  }

  async function handleCrearEtapaInline() {
    if (!obra || !nuevaEtapaNombre.trim()) return
    const nueva = await createEtapa(obra.id, nuevaEtapaNombre.trim(), etapasFiltradas.length + 1)
    if (nueva) {
      setEtapasFiltradas((prev) => [...prev, nueva])
      setItemEtapa(nueva.id)
    }
    setNuevaEtapaNombre('')
    setCreandoEtapaInline(false)
  }

  async function handleCrearPartidaInline() {
    if (!obra || !nuevaPartidaNombre.trim()) return
    const nueva = await createPartida(obra.id, nuevaPartidaNombre.trim(), items[itemActual]?.etapa_id || undefined)
    if (nueva) {
      setPartidasFiltradas((prev) => [...prev, nueva])
      setItemPartida(nueva.id)
    }
    setNuevaPartidaNombre('')
    setCreandoPartidaInline(false)
  }

  function handleSiguiente() {
    setTagInput('')
    setMostrarSugerencias(false)
    if (esUltimo) {
      handleGuardar()
    } else {
      setItemActual((i) => i + 1)
    }
  }

  function handleAnterior() {
    setTagInput('')
    setMostrarSugerencias(false)
    setItemActual((i) => Math.max(0, i - 1))
  }

  async function handleGuardar() {
    if (obra) {
      await saveGasto({
        obra_id: obra.id,
        proveedor,
        rut_proveedor: rut,
        fecha_boleta: fecha,
        total: totalBoleta || items.reduce((s, i) => s + i.subtotal, 0),
        contexto_boleta: contexto,
        imagen_url: imagenDataUrl,
        items: items.map((i) => ({
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          unidad: i.unidad,
          precio_unitario: i.precio_unitario,
          subtotal: i.subtotal,
          categoria: i.categoria,
          etiquetas: i.etiquetas,
          confianza_ia: i.confianza,
          etapa_id: i.etapa_id,
          partida_id: i.partida_id,
          estado: i.etiquetas.length > 0 ? 'confirmado' : 'pendiente',
        })),
      })

      for (const i of items) {
        if (i.etiquetas.length > 0) {
          await upsertClasificacionAprendida({
            obra_id: obra.id,
            descripcion: i.descripcion,
            categoria: i.categoria,
            etiquetas: i.etiquetas,
          })
        }
      }
    }
    router.push('/')
  }

  const sugerenciasFiltradas = tagsObra.filter(
    (t) => t.includes(tagInput.toLowerCase()) && !item?.etiquetas.includes(t)
  )

  if (permisosCargados && !puedeEscanear) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium text-gray-600">No tienes permiso para escanear boletas</p>
        <p className="text-xs text-gray-400 mt-1">Pídele a un administrador de tu cuenta que te lo habilite.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => paso > 1 ? setPaso((paso - 1) as Paso) : router.push('/')}
            className="text-gray-400"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-gray-900">
            {paso === 1 ? 'Contexto de la boleta' : paso === 2 ? 'Fotografiar boleta' : 'Clasificar ítems'}
          </h2>
          <span className="text-xs text-gray-400">{paso}/3</span>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${n <= paso ? 'bg-blue-600' : 'bg-gray-200'}`} />
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
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>

          {obra && <SystemPromptBox obra={obra} />}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Etapa <span className="text-gray-300 font-normal">(opcional)</span>
            </label>
            <select
              value={etapa?.id ?? ''}
              onChange={(e) => handleEtapaChange(e.target.value)}
              disabled={!obra}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white disabled:opacity-40"
            >
              <option value="">Sin etapa</option>
              {etapasFiltradas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Partida <span className="text-gray-300 font-normal">(opcional)</span>
            </label>
            <select
              value={partida?.id ?? ''}
              onChange={(e) => setPartida(partidasFiltradas.find((p) => p.id === e.target.value) ?? null)}
              disabled={!etapa}
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white disabled:opacity-40"
            >
              <option value="">Sin partida</option>
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
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Paso 2 — Captura */}
      {paso === 2 && (
        <div className="px-4 py-5 space-y-4">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleCaptura} className="hidden" />
          <input ref={fileGaleriaRef} type="file" accept="image/*" onChange={handleCaptura} className="hidden" />

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
            onClick={() => fileGaleriaRef.current?.click()}
            className="w-full border border-gray-200 rounded-xl py-2.5 text-sm text-gray-500 font-medium"
          >
            Subir desde galería
          </button>

          <button
            onClick={handleAnalizar}
            disabled={!imagenPreview || analizando || procesandoImagen}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {procesandoImagen ? 'Procesando imagen...' : analizando ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analizando con IA...
              </>
            ) : 'Analizar con IA'}
          </button>
        </div>
      )}

      {/* Paso 3 — Clasificación ítem a ítem */}
      {paso === 3 && item && (
        <div className="px-4 py-5 flex flex-col gap-4">

          {/* Progreso */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Ítem <span className="font-semibold text-gray-700">{itemActual + 1}</span> de {items.length}
            </span>
            <div className="flex gap-2 text-[10px]">
              <span className="bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">{confirmados} con etiqueta</span>
              {pendientes > 0 && <span className="bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{pendientes} pendiente{pendientes > 1 ? 's' : ''}</span>}
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="flex gap-1">
            {items.map((it, idx) => (
              <div
                key={idx}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  idx === itemActual ? 'bg-blue-500' :
                  it.etiquetas.length > 0 ? 'bg-green-400' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          {/* Datos del proveedor */}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Proveedor</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{proveedor}</p>
            <p className="text-xs text-gray-400">RUT {rut} · {fecha}</p>
          </div>

          {/* Tarjeta del ítem */}
          <div className="rounded-2xl border-2 border-blue-100 bg-blue-50/30 p-4">
            {/* Badge IA */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                🤖 Propuesta IA
              </span>
              {item.confianza < 0.7 ? (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                  ⚠ Confianza {Math.round(item.confianza * 100)}%
                </span>
              ) : (
                <span className="text-[10px] text-gray-400">
                  {Math.round(item.confianza * 100)}% confianza
                </span>
              )}
            </div>

            {/* Descripción */}
            <p className="text-base font-bold text-gray-900 mb-1">{item.descripcion}</p>
            <p className="text-xs text-gray-400 mb-3">{item.categoria}</p>

            {/* Etapa y Partida por ítem */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Etapa</p>
                  <button onClick={() => setCreandoEtapaInline(true)} className="text-[10px] text-blue-600 font-medium">+ Nueva</button>
                </div>
                {creandoEtapaInline ? (
                  <div className="flex gap-1">
                    <input
                      autoFocus
                      value={nuevaEtapaNombre}
                      onChange={(e) => setNuevaEtapaNombre(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCrearEtapaInline()}
                      placeholder="Nombre..."
                      className="flex-1 border border-blue-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 min-w-0"
                    />
                    <button onClick={handleCrearEtapaInline} className="bg-blue-600 text-white rounded-lg px-2 text-xs font-bold">✓</button>
                    <button onClick={() => { setCreandoEtapaInline(false); setNuevaEtapaNombre('') }} className="text-gray-400 text-xs px-1">✕</button>
                  </div>
                ) : (
                  <select
                    value={item.etapa_id ?? ''}
                    onChange={(e) => setItemEtapa(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white"
                  >
                    <option value="">Sin etapa</option>
                    {etapasFiltradas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Partida</p>
                  <button onClick={() => setCreandoPartidaInline(true)} className="text-[10px] text-blue-600 font-medium">+ Nueva</button>
                </div>
                {creandoPartidaInline ? (
                  <div className="flex gap-1">
                    <input
                      autoFocus
                      value={nuevaPartidaNombre}
                      onChange={(e) => setNuevaPartidaNombre(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCrearPartidaInline()}
                      placeholder="Nombre..."
                      className="flex-1 border border-blue-300 rounded-lg px-2 py-1.5 text-xs text-gray-700 min-w-0"
                    />
                    <button onClick={handleCrearPartidaInline} className="bg-blue-600 text-white rounded-lg px-2 text-xs font-bold">✓</button>
                    <button onClick={() => { setCreandoPartidaInline(false); setNuevaPartidaNombre('') }} className="text-gray-400 text-xs px-1">✕</button>
                  </div>
                ) : (
                  <select
                    value={item.partida_id ?? ''}
                    onChange={(e) => setItemPartida(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white"
                  >
                    <option value="">Sin partida</option>
                    {partidasFiltradas.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Montos */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-white rounded-xl p-2 text-center border border-gray-100">
                <p className="text-[10px] text-gray-400">Cantidad</p>
                <div className="flex items-center justify-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={item.cantidad}
                    onChange={(e) => setItemCantidad(Number(e.target.value))}
                    className="w-12 text-sm font-bold text-gray-900 text-right outline-none border border-gray-200 rounded-lg px-1 bg-white focus:border-blue-400"
                  />
                  <span className="text-sm font-bold text-gray-900">{item.unidad}</span>
                </div>
              </div>
              <div className="bg-white rounded-xl p-2 text-center border border-gray-100">
                <p className="text-[10px] text-gray-400">Precio unit.</p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.precio_unitario}
                  onChange={(e) => setItemPrecio(Number(e.target.value))}
                  className="w-full text-sm font-bold text-gray-900 text-center outline-none border border-gray-200 rounded-lg px-1 bg-white focus:border-blue-400"
                />
              </div>
              <div className="bg-white rounded-xl p-2 text-center border border-blue-100 bg-blue-50">
                <p className="text-[10px] text-blue-400">Subtotal</p>
                <p className="text-sm font-bold text-blue-700">{formatCLP(item.subtotal)}</p>
              </div>
            </div>

            {/* Etiquetas */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Etiquetas</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {item.etiquetas.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => removeTag(tag)}
                    className="flex items-center gap-1 bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-medium hover:bg-red-500 transition-colors"
                  >
                    {tag} ×
                  </button>
                ))}
                {item.etiquetas.length === 0 && (
                  <span className="text-xs text-gray-400 italic">Sin etiquetas — quedará pendiente</span>
                )}
              </div>

              {/* Input nueva etiqueta */}
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

                {/* Sugerencias */}
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

              {tagInput.trim() && (
                <button
                  onClick={() => addTag(tagInput)}
                  className="mt-1.5 text-xs text-blue-600 font-medium px-2"
                >
                  + Crear etiqueta &quot;{tagInput.trim()}&quot;
                </button>
              )}
            </div>
          </div>

          {/* Navegación */}
          <div className="flex gap-3 mt-2">
            <button
              onClick={handleAnterior}
              disabled={itemActual === 0}
              className="flex-1 border border-gray-200 rounded-xl py-3 text-sm font-semibold text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              onClick={handleSiguiente}
              className={`flex-1 rounded-xl py-3 text-sm font-semibold text-white ${
                esUltimo ? 'bg-green-600' : 'bg-blue-600'
              }`}
            >
              {esUltimo ? 'Guardar boleta' : 'Siguiente'}
            </button>
          </div>

          {/* Resumen al final */}
          {esUltimo && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-xs text-gray-500 text-center">
              Al guardar: <span className="font-semibold text-green-700">{confirmados} ítems confirmados</span>
              {pendientes > 0 && <> · <span className="font-semibold text-amber-600">{pendientes} quedarán pendientes</span></>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
