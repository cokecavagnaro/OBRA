'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getProyectos, getUsuarioActual, getPermisosOverrides, saveIngreso, subirComprobanteManoDeObra } from '@/lib/supabase/db'
import { tienePermiso } from '@/lib/permisos'
import Button from '@/components/ds/Button'
import InputTexto from '@/components/ds/InputTexto'
import InputMonto from '@/components/ds/InputMonto'
import type { Proyecto, Usuario, PermissionOverride } from '@/lib/types'

function IngresoManualContenido() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const proyectoIdParam = searchParams.get('proyecto') ?? ''

  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [proyectoId, setProyectoId] = useState(proyectoIdParam)
  const [remitente, setRemitente] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
  const [nota, setNota] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)
  const comprobanteRef = useRef<HTMLInputElement>(null)

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null)
  const [overrides, setOverrides] = useState<PermissionOverride[]>([])
  const [permisosCargados, setPermisosCargados] = useState(false)
  const puedeRegistrar = usuarioActual ? tienePermiso(usuarioActual, overrides, 'manage_ingresos') : false

  useEffect(() => {
    getProyectos().then(setProyectos)
    getUsuarioActual().then(async (u) => {
      setUsuarioActual(u)
      if (u) setOverrides(await getPermisosOverrides(u.id))
      setPermisosCargados(true)
    })
  }, [])

  const montoNumero = Number(monto) || 0
  const completo = !!proyectoId && remitente.trim().length > 0 && montoNumero > 0 && !!fecha

  async function handleGuardar() {
    if (!completo || !usuarioActual) return
    setGuardando(true)
    setError(null)
    try {
      let imagenUrl: string | null = null
      if (comprobante) imagenUrl = await subirComprobanteManoDeObra(usuarioActual.cuenta_id, proyectoId, comprobante)
      const ingreso = await saveIngreso({
        proyecto_id: proyectoId,
        remitente: remitente.trim(),
        cuenta_destino: cuenta.trim(),
        monto: montoNumero,
        fecha,
        nota: nota.trim() || null,
        imagen_url: imagenUrl,
        origen: 'manual',
        creado_por_email: usuarioActual.email,
      })
      if (!ingreso) {
        setError('No pudimos guardar el ingreso. Intenta de nuevo.')
        return
      }
      router.push(`/proyecto/${proyectoId}`)
    } finally {
      setGuardando(false)
    }
  }

  if (permisosCargados && !puedeRegistrar) {
    return (
      <div className="min-h-screen bg-crema flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-bold text-tinta">No tienes permiso para registrar ingresos</p>
        <p className="text-xs text-gris-texto mt-1">Pídele a un administrador de tu cuenta que te lo habilite.</p>
        <button onClick={() => router.back()} className="text-xs text-dorado-link font-bold mt-3">Volver</button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-ingreso-fondo">
      <div className="px-4 pt-12 pb-4 bg-ingreso border-b-2 border-tinta flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.back()} aria-label="Volver" className="text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-bold text-white truncate">Nuevo ingreso</h2>
        </div>
        <button onClick={() => router.back()} className="border-2 border-white text-white text-xs font-bold px-3 py-1.5 shrink-0">
          ✕ Cancelar
        </button>
      </div>

      <div className="px-4 py-5 space-y-4">
        <div className="bg-white border-2 border-tinta px-3 py-2.5">
          <p className="text-xs text-tinta">
            Registra una transferencia que <b>entra</b> al proyecto. Para leerla desde una foto, usa el botón Escanear.
          </p>
        </div>

        {error && (
          <div className="bg-error/10 border-2 border-error p-3">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        <div>
          <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Proyecto</label>
          <select
            value={proyectoId}
            onChange={(e) => setProyectoId(e.target.value)}
            className="mt-1 w-full border-2 border-tinta bg-white px-3 py-3 text-sm text-tinta min-h-[44px]"
          >
            <option value="">Seleccionar proyecto...</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Quién transfirió</label>
          <InputTexto className="mt-1" value={remitente} onChange={(e) => setRemitente(e.target.value)} placeholder="Nombre o razón social" />
        </div>

        <div>
          <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Cuenta a la que se transfirió</label>
          <InputTexto className="mt-1" value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="Ej: Cuenta Vista ···4821" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Monto</label>
            <InputMonto className="mt-1" value={monto} onChange={setMonto} />
          </div>
          <div>
            <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Fecha</label>
            <InputTexto className="mt-1" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">
            Nota <span className="text-gris-texto font-normal normal-case">(opcional)</span>
          </label>
          <InputTexto className="mt-1" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: primer aporte" />
        </div>

        <div>
          <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">
            Comprobante <span className="text-gris-texto font-normal normal-case">(opcional)</span>
          </label>
          <input
            ref={comprobanteRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          {comprobante ? (
            <div className="mt-1 flex items-center justify-between border-2 border-tinta bg-white px-3 py-2.5">
              <span className="text-sm text-tinta truncate flex-1">{comprobante.name}</span>
              <button
                onClick={() => { setComprobante(null); if (comprobanteRef.current) comprobanteRef.current.value = '' }}
                aria-label="Quitar comprobante"
                className="text-gris-medio text-sm px-2"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => comprobanteRef.current?.click()}
              className="mt-1 w-full border-2 border-dashed border-tinta bg-white py-2.5 text-sm text-gris-medio font-bold"
            >
              + Adjuntar foto o PDF
            </button>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={() => router.back()}>Cancelar</Button>
          <Button className="flex-1 !bg-ingreso !text-white" onClick={handleGuardar} disabled={!completo || guardando}>
            {guardando ? 'Guardando...' : 'Guardar ingreso'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function IngresoManual() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-gris-texto text-sm">Cargando...</p></div>}>
      <IngresoManualContenido />
    </Suspense>
  )
}
