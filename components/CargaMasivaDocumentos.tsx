'use client'

import { useEffect, useRef, useState } from 'react'
import { normalizarImagenParaSubida } from '@/lib/imagen'
import { tienePermiso } from '@/lib/permisos'
import {
  getPermisosOverrides,
  getProyectos,
  getUsuarioActual,
  saveGasto,
  subirDocumentoBoleta,
} from '@/lib/supabase/db'
import type { ItemAnalizado, Proyecto, RespuestaAnalisis, Usuario } from '@/lib/types'

type EstadoArchivo = 'listo' | 'procesando' | 'completado' | 'error'

interface ArchivoCarga {
  id: string
  file: File
  estado: EstadoArchivo
  error?: string
}

interface Props {
  onCargaCompleta: () => void | Promise<void>
}

const LIMITE_ARCHIVOS = 25
const LIMITE_BYTES = 10 * 1024 * 1024

function crearIdArchivo(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`
}

function archivoABase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function mensajeEstado(archivo: ArchivoCarga): string {
  if (archivo.estado === 'procesando') return 'Procesando…'
  if (archivo.estado === 'completado') return 'Cargado'
  if (archivo.estado === 'error') return archivo.error || 'No se pudo cargar'
  return `${(archivo.file.size / 1024 / 1024).toFixed(1)} MB`
}

export default function CargaMasivaDocumentos({ onCargaCompleta }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [proyectoId, setProyectoId] = useState('')
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [permisosCargados, setPermisosCargados] = useState(false)
  const [puedeCargar, setPuedeCargar] = useState(false)
  const [archivos, setArchivos] = useState<ArchivoCarga[]>([])
  const [procesando, setProcesando] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getProyectos(), getUsuarioActual()]).then(async ([lista, actual]) => {
      setProyectos(lista)
      setUsuario(actual)
      if (lista.length === 1) setProyectoId(lista[0].id)
      if (actual) {
        const overrides = await getPermisosOverrides(actual.id)
        setPuedeCargar(tienePermiso(actual, overrides, 'scan_receipts'))
      }
      setPermisosCargados(true)
    })
  }, [])

  function seleccionarArchivos(event: React.ChangeEvent<HTMLInputElement>) {
    const seleccion = Array.from(event.target.files ?? [])
    event.target.value = ''
    setErrorGeneral(null)

    if (seleccion.length > LIMITE_ARCHIVOS) {
      setErrorGeneral(`Puedes cargar hasta ${LIMITE_ARCHIVOS} documentos por lote.`)
      return
    }

    const invalidos = seleccion.filter((file) => {
      const tipoPermitido = file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(heic|heif|jpe?g|png|webp|pdf)$/i.test(file.name)
      return !tipoPermitido || file.size > LIMITE_BYTES
    })
    if (invalidos.length > 0) {
      setErrorGeneral('Usa imágenes o PDF de hasta 10 MB por archivo.')
      return
    }

    setArchivos(seleccion.map((file, index) => ({
      id: crearIdArchivo(file, index),
      file,
      estado: 'listo',
    })))
  }

  function actualizarArchivo(id: string, cambio: Partial<ArchivoCarga>) {
    setArchivos((actuales) => actuales.map((archivo) => archivo.id === id ? { ...archivo, ...cambio } : archivo))
  }

  async function procesarArchivo(archivo: ArchivoCarga, actual: Usuario, proyecto: string) {
    actualizarArchivo(archivo.id, { estado: 'procesando', error: undefined })
    try {
      const esPdf = archivo.file.type === 'application/pdf' || /\.pdf$/i.test(archivo.file.name)
      let archivoPreparado = archivo.file
      if (!esPdf) {
        const { blob } = await normalizarImagenParaSubida(archivo.file)
        archivoPreparado = new File([blob], 'boleta.jpg', { type: 'image/jpeg' })
      }

      const imagenBase64 = await archivoABase64(archivoPreparado)
      const respuesta = await fetch('/api/analizar-boleta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagen_base64: imagenBase64,
          media_type: archivoPreparado.type || (esPdf ? 'application/pdf' : 'image/jpeg'),
          proyecto_id: proyecto,
          contexto_boleta: '',
        }),
      })
      if (!respuesta.ok) {
        const detalle = await respuesta.json().catch(() => null)
        throw new Error(detalle?.error || 'No se pudo analizar el documento.')
      }

      const analisis = await respuesta.json() as RespuestaAnalisis
      const items = (analisis.items ?? []) as ItemAnalizado[]
      if (items.length === 0) throw new Error('No se encontraron ítems en el documento.')

      const imagenUrl = await subirDocumentoBoleta(actual.cuenta_id, proyecto, archivoPreparado)
      if (!imagenUrl) throw new Error('No se pudo guardar el archivo original.')

      const gastoId = await saveGasto({
        proyecto_id: proyecto,
        proveedor: analisis.proveedor ?? '',
        rut_proveedor: analisis.rut ?? '',
        fecha_boleta: analisis.fecha ?? '',
        total: analisis.total ?? items.reduce((suma, item) => suma + item.subtotal, 0),
        imagen_url: imagenUrl,
        contexto_boleta: '',
        creado_por_email: actual.email,
        comentario: analisis.requiere_atencion ? 'Carga masiva · Requiere revisión' : 'Carga masiva',
        interpretacion_precios: analisis.interpretacion_precios,
        iva_impreso: analisis.iva_impreso ?? null,
        otros_impuestos: analisis.otros_impuestos ?? null,
        fuente_interpretacion: analisis.fuente_interpretacion ?? null,
        descuento_general_monto: analisis.descuento_general_monto ?? null,
        descuento_general_descripcion: analisis.descuento_general_descripcion ?? null,
        solicitante_id: actual.id,
        solicitante_rol: actual.rol,
        items: items.map((item) => ({
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
          categoria: item.categoria,
          etiquetas: item.etiquetas ?? [],
          confianza_ia: item.confianza,
          etapa_id: item.etapa_id,
          partida_id: item.partida_id,
          // La carga masiva no tiene revisión ítem a ítem. Se conserva el
          // análisis, pero queda pendiente para que una persona lo valide.
          estado: 'pendiente',
          descuento_monto: item.descuento_monto ?? null,
          descuento_descripcion: item.descuento_descripcion ?? null,
          exento: item.exento ?? false,
        })),
      })
      if (!gastoId) throw new Error('No se pudo registrar el documento.')
      actualizarArchivo(archivo.id, { estado: 'completado' })
      return true
    } catch (error) {
      actualizarArchivo(archivo.id, {
        estado: 'error',
        error: error instanceof Error ? error.message : 'No se pudo cargar',
      })
      return false
    }
  }

  async function iniciarCarga() {
    if (!usuario || !proyectoId || archivos.length === 0 || procesando) return
    setProcesando(true)
    setErrorGeneral(null)
    let completados = 0
    for (const archivo of archivos) {
      if (await procesarArchivo(archivo, usuario, proyectoId)) completados += 1
    }
    setProcesando(false)
    if (completados > 0) await onCargaCompleta()
  }

  function cerrar() {
    if (procesando) return
    setAbierto(false)
    setArchivos([])
    setErrorGeneral(null)
  }

  if (!permisosCargados || !puedeCargar) return null

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5" /></svg>
        Cargar varios documentos
      </button>
    )
  }

  const completados = archivos.filter((archivo) => archivo.estado === 'completado').length
  const fallidos = archivos.filter((archivo) => archivo.estado === 'error').length
  const iniciados = archivos.filter((archivo) => archivo.estado !== 'listo').length
  const termino = archivos.length > 0 && completados + fallidos === archivos.length && !procesando

  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4" aria-labelledby="titulo-carga-masiva">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="titulo-carga-masiva" className="text-sm font-bold text-gray-900">Carga masiva</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">Selecciona un proyecto y hasta {LIMITE_ARCHIVOS} imágenes o PDF.</p>
        </div>
        <button type="button" onClick={cerrar} disabled={procesando} aria-label="Cerrar carga masiva" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 disabled:opacity-40">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <label className="mt-4 block text-xs font-semibold text-gray-700" htmlFor="proyecto-carga-masiva">Proyecto de destino</label>
      <select
        id="proyecto-carga-masiva"
        value={proyectoId}
        onChange={(event) => setProyectoId(event.target.value)}
        disabled={procesando}
        className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 disabled:opacity-60"
      >
        <option value="">Selecciona un proyecto</option>
        {proyectos.map((proyecto) => <option key={proyecto.id} value={proyecto.id}>{proyecto.nombre}</option>)}
      </select>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.heic,.heif"
        multiple
        onChange={seleccionarArchivos}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={procesando}
        className="mt-3 w-full rounded-xl border border-blue-600 bg-white px-4 py-3 text-sm font-semibold text-blue-600 disabled:opacity-50"
      >
        {archivos.length > 0 ? 'Cambiar archivos' : 'Seleccionar desde el dispositivo'}
      </button>

      {archivos.length > 0 && (
        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto" aria-live="polite">
          {archivos.map((archivo) => (
            <div key={archivo.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${archivo.estado === 'completado' ? 'bg-green-100 text-green-700' : archivo.estado === 'error' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                {archivo.estado === 'procesando' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" /> : archivo.estado === 'completado' ? '✓' : archivo.estado === 'error' ? '!' : archivo.file.type === 'application/pdf' ? 'PDF' : 'IMG'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-gray-800">{archivo.file.name}</p>
                <p className={`mt-0.5 text-[10px] ${archivo.estado === 'error' ? 'text-red-600' : archivo.estado === 'completado' ? 'text-green-700' : 'text-gray-400'}`}>{mensajeEstado(archivo)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {errorGeneral && <p className="mt-3 text-xs font-medium text-red-600">{errorGeneral}</p>}
      {termino && (
        <p className="mt-3 text-xs font-semibold text-gray-700">
          {completados} {completados === 1 ? 'documento cargado' : 'documentos cargados'}{fallidos > 0 ? ` · ${fallidos} con error` : ''}
        </p>
      )}

      <button
        type="button"
        onClick={termino ? cerrar : iniciarCarga}
        disabled={!termino && (!proyectoId || archivos.length === 0 || procesando)}
        className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-gray-300"
      >
        {procesando ? `Procesando ${iniciados} de ${archivos.length}…` : termino ? 'Listo' : `Cargar ${archivos.length || ''} ${archivos.length === 1 ? 'documento' : 'documentos'}`}
      </button>
    </section>
  )
}
