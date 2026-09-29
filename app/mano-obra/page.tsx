'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatCLP } from '@/lib/mock'
import { getProyectos, getEtapas, getPartidas, getUsuarioActual, getPermisosOverrides, guardarGastoManoDeObra, subirComprobanteManoDeObra } from '@/lib/supabase/db'
import { listarPersonas, crearPersona } from '@/lib/supabase/personas'
import { tienePermiso } from '@/lib/permisos'
import type { Proyecto, Etapa, Partida, Persona, Usuario, PermissionOverride } from '@/lib/types'
import BackButton from '@/components/BackButton'

type Modo = 'porDia' | 'montoTotal'

function ManoDeObraContenido() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const proyectoIdParam = searchParams.get('proyecto')

  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [etapasFiltradas, setEtapasFiltradas] = useState<Etapa[]>([])
  const [partidasFiltradas, setPartidasFiltradas] = useState<Partida[]>([])
  const [etapaId, setEtapaId] = useState('')
  const [partidaId, setPartidaId] = useState('')
  const [mostrarEtapaPartida, setMostrarEtapaPartida] = useState(false)

  const [personas, setPersonas] = useState<Persona[]>([])
  const [personaId, setPersonaId] = useState('')
  const [creandoPersonaInline, setCreandoPersonaInline] = useState(false)
  const [nuevaPersonaNombre, setNuevaPersonaNombre] = useState('')

  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [modo, setModo] = useState<Modo>('porDia')
  const [cantidad, setCantidad] = useState(1)
  const [unidad, setUnidad] = useState<'día' | 'hora'>('día')
  const [valorJornal, setValorJornal] = useState(0)
  const [montoTotal, setMontoTotal] = useState(0)
  const [concepto, setConcepto] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)
  const comprobanteInputRef = useRef<HTMLInputElement>(null)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null)
  const [overrides, setOverrides] = useState<PermissionOverride[]>([])
  const [permisosCargados, setPermisosCargados] = useState(false)
  const puedeCargar = usuarioActual ? tienePermiso(usuarioActual, overrides, 'scan_receipts') : false

  useEffect(() => {
    getUsuarioActual().then(async (u) => {
      setUsuarioActual(u)
      if (u) {
        setOverrides(await getPermisosOverrides(u.id))
        const personasData = await listarPersonas(u.cuenta_id)
        setPersonas(personasData)
      }
      setPermisosCargados(true)
    })
    getProyectos().then(async (data) => {
      setProyectos(data)
      const preseleccionado = proyectoIdParam ? data.find((p) => p.id === proyectoIdParam) ?? null : null
      if (preseleccionado) await handleProyectoChange(preseleccionado.id, data)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleProyectoChange(id: string, proyectosDisponibles = proyectos) {
    const p = proyectosDisponibles.find((x) => x.id === id) ?? null
    setProyecto(p)
    setEtapaId('')
    setPartidaId('')
    if (p) {
      const [e, part] = await Promise.all([getEtapas(p.id), getPartidas(p.id)])
      setEtapasFiltradas(e)
      setPartidasFiltradas(part)
    } else {
      setEtapasFiltradas([])
      setPartidasFiltradas([])
    }
  }

  function handleEtapaChange(id: string) {
    setEtapaId(id)
    setPartidaId('')
  }

  const nombreParecido = personas.find(
    (p) => p.nombre.toLowerCase() === nuevaPersonaNombre.trim().toLowerCase()
  )

  async function handleCrearPersonaInline() {
    if (!usuarioActual || !nuevaPersonaNombre.trim()) return
    if (nombreParecido) {
      setPersonaId(nombreParecido.id)
      setNuevaPersonaNombre('')
      setCreandoPersonaInline(false)
      return
    }
    const nueva = await crearPersona(usuarioActual.cuenta_id, nuevaPersonaNombre.trim())
    if (nueva) {
      setPersonas((prev) => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setPersonaId(nueva.id)
    } else {
      setError('No pudimos crear esa persona. Puede que ya exista con ese nombre.')
    }
    setNuevaPersonaNombre('')
    setCreandoPersonaInline(false)
  }

  const total = modo === 'porDia' ? cantidad * valorJornal : montoTotal
  const persona = personas.find((p) => p.id === personaId) ?? null
  const formularioCompleto = !!proyecto && !!persona && total > 0

  async function handleGuardar() {
    if (!formularioCompleto || !usuarioActual || !proyecto || !persona) return
    setGuardando(true)
    setError(null)
    try {
      let imagenUrl: string | undefined
      if (comprobante) {
        const url = await subirComprobanteManoDeObra(usuarioActual.cuenta_id, proyecto.id, comprobante)
        if (url) imagenUrl = url
      }
      const gastoId = await guardarGastoManoDeObra({
        proyecto_id: proyecto.id,
        persona_id: persona.id,
        persona_nombre: persona.nombre,
        fecha,
        cantidad: modo === 'porDia' ? cantidad : 1,
        unidad: modo === 'porDia' ? unidad : 'global',
        precio_unitario: modo === 'porDia' ? valorJornal : montoTotal,
        concepto: concepto.trim() || null,
        etapa_id: etapaId || null,
        partida_id: partidaId || null,
        imagen_url: imagenUrl,
        creado_por_email: usuarioActual.email,
        solicitante_id: usuarioActual.id,
        solicitante_rol: usuarioActual.rol,
      })
      if (!gastoId) {
        setError('No pudimos guardar el pago. Intenta de nuevo.')
        return
      }
      router.push(proyecto ? `/proyecto/${proyecto.id}` : '/')
    } finally {
      setGuardando(false)
    }
  }

  if (permisosCargados && !puedeCargar) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium text-gray-600">No tienes permiso para cargar mano de obra</p>
        <p className="text-xs text-gray-400 mt-1">Pídele a un administrador de tu cuenta que te lo habilite.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 pt-12 pb-4 border-b border-gray-100 flex items-center gap-3">
        <BackButton onClick={() => router.back()} ariaLabel="Volver" />
        <h2 className="text-sm font-semibold text-gray-900">Mano de obra</h2>
      </div>

      <div className="px-4 py-5 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Proyecto</label>
          <select
            value={proyecto?.id ?? ''}
            onChange={(e) => handleProyectoChange(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white"
          >
            <option value="">Seleccionar proyecto...</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Persona</label>
            {!creandoPersonaInline && (
              <button onClick={() => setCreandoPersonaInline(true)} className="text-xs text-blue-600 font-medium">+ Nueva persona</button>
            )}
          </div>
          {creandoPersonaInline ? (
            <div className="space-y-1">
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={nuevaPersonaNombre}
                  onChange={(e) => setNuevaPersonaNombre(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCrearPersonaInline()}
                  placeholder="Nombre de la persona..."
                  className="flex-1 border border-blue-300 rounded-xl px-3 py-2 text-sm text-gray-700 min-w-0"
                />
                <button onClick={handleCrearPersonaInline} className="bg-blue-600 text-white rounded-xl px-3 text-sm font-bold">✓</button>
                <button
                  onClick={() => { setCreandoPersonaInline(false); setNuevaPersonaNombre('') }}
                  className="text-gray-400 text-sm px-1"
                >
                  ✕
                </button>
              </div>
              {nombreParecido && (
                <p className="text-xs text-amber-600">Ya existe &quot;{nombreParecido.nombre}&quot; — se usará esa persona.</p>
              )}
            </div>
          ) : (
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white"
            >
              <option value="">Seleccionar persona...</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cómo se calcula el pago</label>
          <div className="mt-1 flex border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setModo('porDia')}
              className={`flex-1 py-2 text-sm font-medium ${modo === 'porDia' ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}
            >
              Por día/hora
            </button>
            <button
              onClick={() => setModo('montoTotal')}
              className={`flex-1 py-2 text-sm font-medium ${modo === 'montoTotal' ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}
            >
              Monto total
            </button>
          </div>
        </div>

        {modo === 'porDia' ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cantidad</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={cantidad}
                  onChange={(e) => setCantidad(Number(e.target.value))}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white"
                />
                <div className="flex border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setUnidad('día')}
                    className={`px-3 text-sm font-medium ${unidad === 'día' ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}
                  >
                    Día
                  </button>
                  <button
                    onClick={() => setUnidad('hora')}
                    className={`px-3 text-sm font-medium ${unidad === 'hora' ? 'bg-blue-50 text-blue-700' : 'text-gray-500'}`}
                  >
                    Hora
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor {unidad === 'día' ? 'jornal' : 'hora'}</label>
              <input
                type="number"
                inputMode="decimal"
                value={valorJornal || ''}
                onChange={(e) => setValorJornal(Number(e.target.value))}
                placeholder="$ 0"
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white placeholder-gray-300"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto a pagar</label>
            <input
              type="number"
              inputMode="decimal"
              value={montoTotal || ''}
              onChange={(e) => setMontoTotal(Number(e.target.value))}
              placeholder="$ 0"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white placeholder-gray-300"
            />
          </div>
        )}

        <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
          <span className="text-sm text-gray-500">Total</span>
          <span className="text-lg font-semibold text-gray-900">{formatCLP(total)}</span>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Concepto <span className="text-gray-300 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: instalación de moldaje"
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white placeholder-gray-300"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Comprobante de pago <span className="text-gray-300 font-normal">(opcional)</span>
          </label>
          <input
            ref={comprobanteInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          {comprobante ? (
            <div className="mt-1 flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2.5">
              <span className="text-sm text-gray-700 truncate flex-1">{comprobante.name}</span>
              <button
                onClick={() => { setComprobante(null); if (comprobanteInputRef.current) comprobanteInputRef.current.value = '' }}
                className="text-gray-400 text-sm px-2"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => comprobanteInputRef.current?.click()}
              className="mt-1 w-full border border-dashed border-gray-200 rounded-xl py-2.5 text-sm text-gray-500 font-medium"
            >
              + Adjuntar foto o PDF del comprobante
            </button>
          )}
        </div>

        <div className="border-t border-gray-100 pt-3">
          <button
            onClick={() => setMostrarEtapaPartida((v) => !v)}
            className="text-xs text-gray-500 font-medium"
          >
            Etapa y partida (opcional) {mostrarEtapaPartida ? '▲' : '▼'}
          </button>
          {mostrarEtapaPartida && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <select
                value={etapaId}
                onChange={(e) => handleEtapaChange(e.target.value)}
                disabled={!proyecto}
                className="border border-gray-200 rounded-xl px-2 py-2 text-xs text-gray-700 bg-white disabled:opacity-40"
              >
                <option value="">Sin etapa</option>
                {etapasFiltradas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <select
                value={partidaId}
                onChange={(e) => setPartidaId(e.target.value)}
                disabled={!etapaId}
                className="border border-gray-200 rounded-xl px-2 py-2 text-xs text-gray-700 bg-white disabled:opacity-40"
              >
                <option value="">Sin partida</option>
                {partidasFiltradas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          )}
        </div>

        <button
          onClick={handleGuardar}
          disabled={!formularioCompleto || guardando}
          className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default function ManoDeObra() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-gray-400 text-sm">Cargando...</p></div>}>
      <ManoDeObraContenido />
    </Suspense>
  )
}
