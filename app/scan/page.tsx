'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatCLP } from '@/lib/mock'
import { getProyectos, getEtapas, getPartidas, getEtiquetas, getGastoPorId, saveGasto, saveIngreso, reescanearGasto, subirImagenBoleta, createEtapa, createPartida, upsertClasificacionAprendida, getUsuarioActual, getPermisosOverrides } from '@/lib/supabase/db'
import { normalizarImagenParaSubida } from '@/lib/imagen'
import { tienePermiso } from '@/lib/permisos'
import { calcularNetoBruto, calcularCruce, decidirExencionCargos, FACTOR_IVA, type InterpretacionPrecio, type FuenteInterpretacion } from '@/lib/confianzaDocumento'
import CruceItemsTotal from '@/components/CruceItemsTotal'
import BottomSheet from '@/components/ds/BottomSheet'
import Button from '@/components/ds/Button'
import InputMonto from '@/components/ds/InputMonto'
import type { Proyecto, Etapa, Partida, ItemAnalizado, Usuario, PermissionOverride } from '@/lib/types'

type Paso = 1 | 2 | 3

const ITEMS_DEMO: ItemAnalizado[] = [
  { descripcion: 'Pintura látex blanca 20L', cantidad: 4, unidad: 'un', precio_unitario: 28990, subtotal: 115960, categoria: 'Pinturas', etiquetas: ['pintura', 'látex'], confianza: 0.95 },
  { descripcion: 'Rodillo lana 23cm', cantidad: 2, unidad: 'un', precio_unitario: 4990, subtotal: 9980, categoria: 'Herramientas', etiquetas: ['pintura'], confianza: 0.88 },
  { descripcion: 'Elemento no identificado', cantidad: 1, unidad: 'gl', precio_unitario: 5500, subtotal: 5500, categoria: 'Sin clasificar', etiquetas: [], confianza: 0.45 },
]

function ScanContenido() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const gastoIdReescaneo = searchParams.get('reescanear')
  const [cargandoReescaneo, setCargandoReescaneo] = useState(!!gastoIdReescaneo)
  const [errorCargaReescaneo, setErrorCargaReescaneo] = useState<string | null>(null)
  const [paso, setPaso] = useState<Paso>(1)

  // Tipo de documento: la IA decide si lo escaneado es un gasto (boleta) o un
  // ingreso (comprobante de transferencia que entra al proyecto). Define el
  // color de las pantallas posteriores al análisis: rojo = gasto, verde = ingreso.
  const [tipoDoc, setTipoDoc] = useState<'gasto' | 'ingreso'>('gasto')
  const [ingRemitente, setIngRemitente] = useState('')
  const [ingCuenta, setIngCuenta] = useState('')
  const [ingMonto, setIngMonto] = useState('')
  const [ingFecha, setIngFecha] = useState(new Date().toISOString().split('T')[0])
  const [ingNota, setIngNota] = useState('')
  const [ingConfianza, setIngConfianza] = useState<number | null>(null)
  const [ingErrorGuardar, setIngErrorGuardar] = useState<string | null>(null)
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false)

  // Paso 1
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [etapa, setEtapa] = useState<Etapa | null>(null)
  const [partida, setPartida] = useState<Partida | null>(null)

  // Paso 2
  const [imagenPreview, setImagenPreview] = useState<string | null>(null)
  const [imagenDataUrl, setImagenDataUrl] = useState<string>('')
  const [analizando, setAnalizando] = useState(false)
  const [procesandoImagen, setProcesandoImagen] = useState(false)
  const [errorImagen, setErrorImagen] = useState<string | null>(null)
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null)
  const [requiereAtencion, setRequiereAtencion] = useState(false)
  const [verificandoCalidad, setVerificandoCalidad] = useState(false)
  const [calidadImagen, setCalidadImagen] = useState<{ ok: boolean; motivo: string | null } | null>(null)
  const [modoManual, setModoManual] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileGaleriaRef = useRef<HTMLInputElement>(null)

  // Paso 3 — primero se revisan los totales (cuadre bruto/neto vs. total e
  // IVA impreso), después se etiqueta ítem a ítem. Para cuando el usuario
  // llega al carrusel, bruto/neto ya está resuelto y estable.
  const [revisionTotales, setRevisionTotales] = useState(true)
  const [items, setItems] = useState<ItemAnalizado[]>(ITEMS_DEMO)
  const [itemActual, setItemActual] = useState(0)
  const [tagInput, setTagInput] = useState('')
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [proveedor, setProveedor] = useState('Sodimac Quilicura')
  const [rut, setRut] = useState('96.928.180-5')
  const [fecha, setFecha] = useState('2024-06-10')
  const [totalBoleta, setTotalBoleta] = useState(0)
  const [interpretacionPrecios, setInterpretacionPrecios] = useState<InterpretacionPrecio | undefined>(undefined)
  const [ivaImpreso, setIvaImpreso] = useState<number | null>(null)
  const [otrosImpuestos, setOtrosImpuestos] = useState<number | null>(null)
  const [confirmandoDescuadre, setConfirmandoDescuadre] = useState(false)
  const [tipoCargoManual, setTipoCargoManual] = useState<'Envío' | 'Flete' | 'Servicio'>('Envío')
  const [fuenteInterpretacion, setFuenteInterpretacion] = useState<FuenteInterpretacion | null>(null)
  const [descuentoGeneralMonto, setDescuentoGeneralMonto] = useState<number | undefined>(undefined)
  const [descuentoGeneralDescripcion, setDescuentoGeneralDescripcion] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')

  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [etapasFiltradas, setEtapasFiltradas] = useState<Etapa[]>([])
  const [partidasFiltradas, setPartidasFiltradas] = useState<Partida[]>([])
  const [tagsProyecto, setTagsProyecto] = useState<string[]>([])

  // Creación inline en paso 3
  const [creandoEtapaInline, setCreandoEtapaInline] = useState(false)
  const [nuevaEtapaNombre, setNuevaEtapaNombre] = useState('')
  const [creandoPartidaInline, setCreandoPartidaInline] = useState(false)
  const [nuevaPartidaNombre, setNuevaPartidaNombre] = useState('')

  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null)
  const [overrides, setOverrides] = useState<PermissionOverride[]>([])
  const [permisosCargados, setPermisosCargados] = useState(false)
  const puedeEscanear = usuarioActual ? tienePermiso(usuarioActual, overrides, 'scan_receipts') : false
  const puedeRegistrarIngresos = usuarioActual ? tienePermiso(usuarioActual, overrides, 'manage_ingresos') : false

  useEffect(() => {
    getProyectos().then(setProyectos)
    getUsuarioActual().then(async (u) => {
      setUsuarioActual(u)
      if (u) setOverrides(await getPermisosOverrides(u.id))
      setPermisosCargados(true)
    })
  }, [])

  // Modo re-escaneo (?reescanear=<gasto_id>, ver components/FichaBoleta.tsx):
  // se saltan paso 1 y 2 (proyecto y foto ya se conocen del gasto existente),
  // se re-analiza la imagen ya guardada con la IA, y se aterriza directo en
  // paso 3 / revisión de totales — mismo punto de entrada que un escaneo
  // nuevo desde ahí en adelante.
  useEffect(() => {
    if (!gastoIdReescaneo || !permisosCargados) return
    if (!usuarioActual || (usuarioActual.rol !== 'admin' && usuarioActual.rol !== 'super_admin')) {
      setErrorCargaReescaneo('Solo un administrador puede re-escanear boletas.')
      setCargandoReescaneo(false)
      return
    }
    let cancelado = false
    ;(async () => {
      try {
        const gasto = await getGastoPorId(gastoIdReescaneo)
        if (!gasto || !gasto.imagen_url) throw new Error('No pudimos encontrar la boleta a re-escanear.')

        const [proyectosData, etapasData, partidasData, tagsData] = await Promise.all([
          getProyectos(),
          getEtapas(gasto.proyecto_id),
          getPartidas(gasto.proyecto_id),
          getEtiquetas(gasto.proyecto_id),
        ])
        if (cancelado) return
        setProyecto(proyectosData.find((p) => p.id === gasto.proyecto_id) ?? null)
        setEtapasFiltradas(etapasData)
        setPartidasFiltradas(partidasData)
        setTagsProyecto(tagsData)

        const resImagen = await fetch(gasto.imagen_url)
        const blob = await resImagen.blob()
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })

        const res = await fetch('/api/analizar-boleta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imagen_base64: base64,
            media_type: blob.type || 'image/jpeg',
            proyecto_id: gasto.proyecto_id,
            contexto_boleta: gasto.contexto_boleta,
            solo_gasto: true,
          }),
        })
        if (!res.ok) {
          const errData = await res.json().catch(() => null)
          throw new Error(errData?.error || 'No pudimos re-escanear la boleta. Intenta de nuevo.')
        }
        const data = await res.json()
        const itemsResultado = data.items ?? []
        if (itemsResultado.length === 0) throw new Error('No pudimos identificar ítems en esta boleta.')
        if (cancelado) return

        setProveedor(data.proveedor ?? '')
        setRut(data.rut ?? '')
        setFecha(data.fecha ?? '')
        if (data.total) setTotalBoleta(data.total)
        setRequiereAtencion(Boolean(data.requiere_atencion))
        setInterpretacionPrecios(data.interpretacion_precios)
        setIvaImpreso(data.iva_impreso ?? null)
        setOtrosImpuestos(data.otros_impuestos ?? null)
        setFuenteInterpretacion(data.fuente_interpretacion ?? null)
        setDescuentoGeneralMonto(data.descuento_general_monto)
        setDescuentoGeneralDescripcion(data.descuento_general_descripcion ?? null)
        setModoManual(false)
        setItems(itemsResultado.map((i: ItemAnalizado) => ({
          ...i,
          etapa_id: i.etapa_id ?? '',
          partida_id: i.partida_id ?? '',
        })))
        setItemActual(0)
        setTagInput('')
        setConfirmandoDescuadre(false)
        setRevisionTotales(true)
        setPaso(3)
      } catch (err) {
        if (!cancelado) setErrorCargaReescaneo(err instanceof Error ? err.message : 'No pudimos re-escanear la boleta.')
      } finally {
        if (!cancelado) setCargandoReescaneo(false)
      }
    })()
    return () => { cancelado = true }
  }, [gastoIdReescaneo, permisosCargados, usuarioActual])

  const paso1Completo = !!proyecto

  const item = items[itemActual]
  const esUltimo = itemActual === items.length - 1
  const confirmados = items.filter((i) => i.etiquetas.length > 0).length
  const pendientes = items.filter((i) => i.etiquetas.length === 0).length

  async function handleProyectoChange(id: string) {
    const o = proyectos.find((x) => x.id === id) ?? null
    setProyecto(o)
    setEtapa(null)
    setPartida(null)
    if (o) {
      const [e, p, tags] = await Promise.all([getEtapas(o.id), getPartidas(o.id), getEtiquetas(o.id)])
      setEtapasFiltradas(e)
      setPartidasFiltradas(p)
      setTagsProyecto(tags)
    } else {
      setEtapasFiltradas([])
      setPartidasFiltradas([])
      setTagsProyecto([])
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

  function setItemDescripcion(descripcion: string) {
    setItems((prev) => prev.map((x, idx) => idx === itemActual ? { ...x, descripcion } : x))
  }

  function setItemCategoria(categoria: string) {
    setItems((prev) => prev.map((x, idx) => idx === itemActual ? { ...x, categoria } : x))
  }

  const fileSeleccionadoRef = useRef<File | null>(null)
  const capturaTokenRef = useRef(0)

  async function handleCaptura(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setErrorImagen(null)
    setProcesandoImagen(true)
    setCalidadImagen(null)
    const token = ++capturaTokenRef.current
    try {
      const { blob, dataUrl } = await normalizarImagenParaSubida(file)
      if (capturaTokenRef.current !== token) return
      fileSeleccionadoRef.current = new File([blob], 'boleta.jpg', { type: 'image/jpeg' })
      setImagenPreview(dataUrl)
      verificarCalidadImagen(fileSeleccionadoRef.current, token)
    } catch (err) {
      console.error('Error al procesar imagen:', err)
      if (capturaTokenRef.current !== token) return
      setErrorImagen('No pudimos procesar esta imagen. Prueba con otra foto.')
    } finally {
      if (capturaTokenRef.current === token) setProcesandoImagen(false)
      input.value = ''
    }
  }

  async function verificarCalidadImagen(file: File, token: number) {
    setVerificandoCalidad(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/verificar-calidad-imagen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen_base64: base64, media_type: file.type || 'image/jpeg' }),
      })
      if (capturaTokenRef.current !== token || !res.ok) return
      const data = await res.json()
      setCalidadImagen({ ok: Boolean(data.calidad_suficiente), motivo: data.motivo ?? null })
    } catch (err) {
      console.error('Error al verificar calidad de imagen:', err)
    } finally {
      if (capturaTokenRef.current === token) setVerificandoCalidad(false)
    }
  }

  async function handleAnalizar() {
    const file = fileSeleccionadoRef.current
    if (!file || !proyecto) return

    setErrorAnalisis(null)
    setRequiereAtencion(false)
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

      const res = await fetch('/api/analizar-boleta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagen_base64: base64,
          media_type: file.type || 'image/jpeg',
          proyecto_id: proyecto.id,
          contexto_boleta: '',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'No pudimos analizar la boleta. Intenta de nuevo.')
      }

      const data = await res.json()

      // La IA reconoció un comprobante de transferencia que entra al proyecto:
      // se salta todo el flujo de boleta y se pasa a la pantalla verde.
      if (data.tipo === 'ingreso' && data.ingreso) {
        setImagenDataUrl(dataUrl)
        setTipoDoc('ingreso')
        setIngRemitente(data.ingreso.remitente ?? '')
        setIngCuenta(data.ingreso.cuenta_destino ?? '')
        setIngMonto(String(Math.round(data.ingreso.monto ?? 0)))
        setIngFecha(data.ingreso.fecha || new Date().toISOString().split('T')[0])
        setIngNota('')
        setIngConfianza(typeof data.confianza === 'number' ? data.confianza : null)
        setIngErrorGuardar(null)
        setPaso(3)
        return
      }
      setTipoDoc('gasto')

      const itemsResultado = data.items ?? []

      if (itemsResultado.length === 0) {
        setErrorAnalisis('No pudimos identificar ítems en esta boleta. Prueba con otra foto o vuelve a intentar.')
        return
      }

      setImagenDataUrl(dataUrl)
      // Siempre se fija (no solo si viene truthy): si la IA no logró leer
      // el dato y devolvió "", el campo debe verse vacío en pantalla — no
      // quedarse pegado al proveedor/RUT/fecha del escaneo anterior.
      setProveedor(data.proveedor ?? '')
      setRut(data.rut ?? '')
      setFecha(data.fecha ?? '')
      if (data.total) setTotalBoleta(data.total)
      setRequiereAtencion(Boolean(data.requiere_atencion))
      setInterpretacionPrecios(data.interpretacion_precios)
      setIvaImpreso(data.iva_impreso ?? null)
      setOtrosImpuestos(data.otros_impuestos ?? null)
      setFuenteInterpretacion(data.fuente_interpretacion ?? null)
      setDescuentoGeneralMonto(data.descuento_general_monto)
      setDescuentoGeneralDescripcion(data.descuento_general_descripcion ?? null)

      setModoManual(false)
      setItems(itemsResultado.map((i: ItemAnalizado) => ({
        ...i,
        etapa_id: i.etapa_id ?? etapa?.id ?? '',
        partida_id: i.partida_id ?? partida?.id ?? '',
      })))
      setItemActual(0)
      setTagInput('')
      setConfirmandoDescuadre(false)
      setRevisionTotales(true)
      setPaso(3)
    } catch (err) {
      console.error(err)
      setErrorAnalisis(err instanceof Error ? err.message : 'No pudimos analizar la boleta. Intenta de nuevo.')
    } finally {
      setAnalizando(false)
    }
  }

  function handleIngresoManual() {
    setTipoDoc('gasto')
    setModoManual(true)
    setProveedor('')
    setRut('')
    setFecha(new Date().toISOString().split('T')[0])
    setTotalBoleta(0)
    setRequiereAtencion(false)
    setInterpretacionPrecios(undefined)
    setIvaImpreso(null)
    setOtrosImpuestos(null)
    setFuenteInterpretacion(null)
    setDescuentoGeneralMonto(undefined)
    setDescuentoGeneralDescripcion(null)
    setItems([{
      descripcion: '',
      cantidad: 1,
      unidad: 'un',
      precio_unitario: 0,
      subtotal: 0,
      categoria: '',
      etiquetas: [],
      confianza: 1,
      etapa_id: etapa?.id ?? '',
      partida_id: partida?.id ?? '',
    }])
    setItemActual(0)
    setTagInput('')
    // Ingreso manual no pasa por la IA, así que no hay nada que reconciliar
    // contra IVA impreso/total leído — se salta directo al carrusel.
    setRevisionTotales(false)
    setPaso(3)
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
    if (!proyecto || !nuevaEtapaNombre.trim()) return
    const nueva = await createEtapa(proyecto.id, nuevaEtapaNombre.trim(), etapasFiltradas.length + 1)
    if (nueva) {
      setEtapasFiltradas((prev) => [...prev, nueva])
      setItemEtapa(nueva.id)
    }
    setNuevaEtapaNombre('')
    setCreandoEtapaInline(false)
  }

  async function handleCrearPartidaInline() {
    if (!proyecto || !nuevaPartidaNombre.trim()) return
    const nueva = await createPartida(proyecto.id, nuevaPartidaNombre.trim(), items[itemActual]?.etapa_id || undefined)
    if (nueva) {
      setPartidasFiltradas((prev) => [...prev, nueva])
      setItemPartida(nueva.id)
    }
    setNuevaPartidaNombre('')
    setCreandoPartidaInline(false)
  }

  function handleSiguiente() {
    const tagPendiente = tagInput.trim()
    setTagInput('')
    setMostrarSugerencias(false)
    if (esUltimo) {
      handleGuardar(tagPendiente)
    } else {
      if (tagPendiente) addTag(tagPendiente)
      setItemActual((i) => i + 1)
    }
  }

  function handleAnterior() {
    const tagPendiente = tagInput.trim()
    setTagInput('')
    setMostrarSugerencias(false)
    if (tagPendiente) addTag(tagPendiente)
    setItemActual((i) => Math.max(0, i - 1))
  }

  // Salida para el descuadre que en realidad es un flete que la IA no alcanzó
  // a leer (caso real: "Envío $10.000" listado aparte del subtotal). Agrega el
  // monto faltante como ítem propio y etiquetable en vez de dejar la boleta
  // marcada con un descuadre para siempre.
  function agregarCargoManual(faltante: number) {
    const interpretacion = interpretacionPrecios ?? 'bruto'
    const sumaItems = items.reduce((s, i) => s + (i.subtotal ?? 0), 0)
    const exento = decidirExencionCargos(sumaItems, faltante, interpretacion, ivaImpreso)
    // El descuadre se mide en bruto. Un ítem gravado dentro de una boleta neta
    // aporta subtotal × 1.19, así que hay que guardarlo en la escala correcta
    // o el cuadre se vuelve a romper.
    const subtotal = exento || interpretacion === 'bruto'
      ? Math.round(faltante)
      : Math.round(faltante / FACTOR_IVA)
    const esServicio = tipoCargoManual === 'Servicio'
    setItems((prev) => [
      ...prev,
      {
        descripcion: tipoCargoManual,
        cantidad: 1,
        unidad: 'un',
        precio_unitario: subtotal,
        subtotal,
        categoria: esServicio ? 'Servicios' : 'Despacho',
        etiquetas: esServicio ? ['servicio'] : ['envío'],
        confianza: 1,
        exento,
      },
    ])
  }

  // El documento se había leído como gasto pero en realidad es una
  // transferencia que entra: se pasa a la pantalla de ingreso con lo que ya hay.
  function cambiarAIngreso() {
    setTipoDoc('ingreso')
    setIngRemitente('')
    setIngCuenta('')
    setIngMonto(totalBoleta > 0 ? String(Math.round(totalBoleta)) : '')
    setIngFecha(fecha || new Date().toISOString().split('T')[0])
    setIngNota('')
    setIngConfianza(null)
    setIngErrorGuardar(null)
  }

  // Al revés: la IA lo leyó como ingreso pero es un gasto. Se sigue por la
  // carga manual de gasto, que no depende de lo que la IA haya leído.
  function cambiarAGasto() {
    handleIngresoManual()
  }

  function handleCancelar() {
    if (gastoIdReescaneo) { router.back(); return }
    if (paso === 3) setConfirmandoCancelar(true)
    else router.push('/')
  }

  async function handleGuardarIngreso() {
    if (guardandoRef.current || !proyecto || !usuarioActual) return
    guardandoRef.current = true
    setGuardando(true)
    setIngErrorGuardar(null)
    try {
      let imagenUrl: string | null = null
      if (fileSeleccionadoRef.current) {
        imagenUrl = await subirImagenBoleta(usuarioActual.cuenta_id, proyecto.id, fileSeleccionadoRef.current)
      }
      const ingreso = await saveIngreso({
        proyecto_id: proyecto.id,
        remitente: ingRemitente.trim(),
        cuenta_destino: ingCuenta.trim(),
        monto: Number(ingMonto) || 0,
        fecha: ingFecha,
        nota: ingNota.trim() || null,
        imagen_url: imagenUrl,
        origen: ingConfianza != null ? 'foto' : 'manual',
        creado_por_email: usuarioActual.email,
      })
      if (!ingreso) {
        setIngErrorGuardar('No pudimos guardar el ingreso. Intenta de nuevo.')
        return
      }
      router.push(`/proyecto/${proyecto.id}`)
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  async function handleGuardar(tagPendiente?: string) {
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      // Si quedó texto sin confirmar en el input de etiqueta (el usuario escribió
      // pero nunca tocó Enter/"+ Crear etiqueta"), se incorpora acá antes de guardar
      // — leer `items` del estado directamente se arriesga a perder ese tag porque
      // el setItems de addTag no llega a re-renderizar antes de este guardado.
      const t = tagPendiente?.toLowerCase().trim()
      const itemsFinal = t
        ? items.map((x, idx) => idx === itemActual && !x.etiquetas.includes(t) ? { ...x, etiquetas: [...x.etiquetas, t] } : x)
        : items

      if (gastoIdReescaneo) {
        await reescanearGasto(gastoIdReescaneo, {
          proveedor,
          rut,
          fecha,
          moneda: 'CLP',
          items: itemsFinal,
          total: totalBoleta || itemsFinal.reduce((s, i) => s + i.subtotal, 0),
          interpretacion_precios: modoManual ? 'bruto' : interpretacionPrecios,
          iva_impreso: modoManual ? null : ivaImpreso,
          otros_impuestos: modoManual ? null : otrosImpuestos,
          fuente_interpretacion: modoManual ? undefined : (fuenteInterpretacion ?? undefined),
          descuento_general_monto: modoManual ? undefined : descuentoGeneralMonto,
          descuento_general_descripcion: modoManual ? null : descuentoGeneralDescripcion,
        })
        if (proyecto) {
          for (const i of itemsFinal) {
            if (i.etiquetas.length > 0) {
              await upsertClasificacionAprendida({
                proyecto_id: proyecto.id,
                descripcion: i.descripcion,
                categoria: i.categoria,
                etiquetas: i.etiquetas,
              })
            }
          }
        }
        router.push('/')
        return
      }

      if (proyecto) {
        if (!usuarioActual) return
        let imagenUrl = imagenDataUrl
        if (fileSeleccionadoRef.current) {
          const url = await subirImagenBoleta(usuarioActual.cuenta_id, proyecto.id, fileSeleccionadoRef.current)
          if (url) imagenUrl = url
        }
        await saveGasto({
          proyecto_id: proyecto.id,
          proveedor,
          rut_proveedor: rut,
          fecha_boleta: fecha,
          total: totalBoleta || itemsFinal.reduce((s, i) => s + i.subtotal, 0),
          contexto_boleta: '',
          creado_por_email: usuarioActual.email,
          comentario: comentario.trim() || null,
          interpretacion_precios: modoManual ? 'bruto' : interpretacionPrecios,
          iva_impreso: modoManual ? null : ivaImpreso,
          otros_impuestos: modoManual ? null : otrosImpuestos,
          fuente_interpretacion: modoManual ? null : fuenteInterpretacion,
          descuento_general_monto: modoManual ? null : descuentoGeneralMonto,
          descuento_general_descripcion: modoManual ? null : descuentoGeneralDescripcion,
          solicitante_id: usuarioActual.id,
          solicitante_rol: usuarioActual.rol,
          imagen_url: imagenUrl,
          items: itemsFinal.map((i) => ({
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
            descuento_monto: modoManual ? null : i.descuento_monto ?? null,
            descuento_descripcion: modoManual ? null : i.descuento_descripcion ?? null,
            exento: modoManual ? false : i.exento ?? false,
          })),
        })

        for (const i of itemsFinal) {
          if (i.etiquetas.length > 0) {
            await upsertClasificacionAprendida({
              proyecto_id: proyecto.id,
              descripcion: i.descripcion,
              categoria: i.categoria,
              etiquetas: i.etiquetas,
            })
          }
        }
      }
      router.push('/')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const sugerenciasFiltradas = tagsProyecto.filter(
    (t) => t.includes(tagInput.toLowerCase()) && !item?.etiquetas.includes(t)
  )

  if (permisosCargados && !puedeEscanear) {
    return (
      <div className="min-h-screen bg-crema flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium text-gris-medio">No tienes permiso para escanear boletas</p>
        <p className="text-xs text-gris-texto mt-1">Pídele a un administrador de tu cuenta que te lo habilite.</p>
      </div>
    )
  }

  if (gastoIdReescaneo && errorCargaReescaneo) {
    return (
      <div className="min-h-screen bg-crema flex flex-col items-center justify-center px-6 text-center gap-3">
        <p className="text-sm font-medium text-gris-medio">{errorCargaReescaneo}</p>
        <button onClick={() => router.back()} className="text-xs text-dorado-link font-medium">Volver</button>
      </div>
    )
  }

  if (gastoIdReescaneo && cargandoReescaneo) {
    return (
      <div className="min-h-screen bg-crema flex flex-col items-center justify-center gap-3">
        <svg className="w-6 h-6 animate-spin text-dorado-link" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-gris-medio">Re-escaneando boleta...</p>
      </div>
    )
  }

  // Tono de las pantallas posteriores al análisis: verde = ingreso, rojo = gasto.
  const tono = paso === 3
    ? tipoDoc === 'ingreso'
      ? { fondo: 'bg-ingreso-fondo', header: 'bg-ingreso', texto: 'text-white', borde: 'border-white' }
      : { fondo: 'bg-gasto-fondo', header: 'bg-error', texto: 'text-white', borde: 'border-white' }
    : { fondo: 'bg-crema', header: 'bg-crema-header', texto: 'text-tinta', borde: 'border-tinta' }
  const titulo =
    paso === 1 ? 'Contexto del documento'
    : paso === 2 ? 'Fotografiar documento'
    : tipoDoc === 'ingreso' ? 'Ingreso de dinero'
    : revisionTotales ? 'Gasto · revisar totales'
    : 'Gasto · clasificar ítems'

  return (
    <div className={`min-h-screen ${tono.fondo}`}>
      {/* Header */}
      <div className={`px-4 pt-12 pb-4 border-b-2 border-tinta ${tono.header}`}>
        <div className="flex items-center justify-between gap-2 mb-4">
          <button
            onClick={() => {
              if (paso === 3 && tipoDoc === 'gasto' && !revisionTotales && !modoManual) { setRevisionTotales(true); return }
              if (gastoIdReescaneo) { router.back(); return }
              if (paso > 1) setPaso((paso - 1) as Paso)
              else router.push('/')
            }}
            aria-label="Volver"
            className={paso === 3 ? 'text-white' : 'text-gris-medio'}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className={`text-sm font-bold ${tono.texto}`}>{titulo}</h2>
          <button onClick={handleCancelar} className={`border-2 ${tono.borde} ${tono.texto} text-xs font-bold px-3 py-1.5 shrink-0`}>
            ✕ Cancelar
          </button>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-1.5 flex-1 border-2 border-tinta transition-colors ${n <= paso ? 'bg-tinta' : 'bg-white'}`} />
          ))}
        </div>
      </div>

      {/* Paso 1 — Contexto */}
      {paso === 1 && (
        <div className="px-4 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gris-medio uppercase tracking-wide">Proyecto</label>
            <select
              value={proyecto?.id ?? ''}
              onChange={(e) => handleProyectoChange(e.target.value)}
              className="mt-1 w-full border-2 border-tinta px-3 py-2.5 text-sm text-gris-medio bg-white"
            >
              <option value="">Seleccionar proyecto...</option>
              {proyectos.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gris-medio uppercase tracking-wide">
              Etapa <span className="text-gris-texto font-normal">(opcional)</span>
            </label>
            <select
              value={etapa?.id ?? ''}
              onChange={(e) => handleEtapaChange(e.target.value)}
              disabled={!proyecto}
              className="mt-1 w-full border-2 border-tinta px-3 py-2.5 text-sm text-gris-medio bg-white disabled:opacity-40"
            >
              <option value="">Sin etapa</option>
              {etapasFiltradas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gris-medio uppercase tracking-wide">
              Partida <span className="text-gris-texto font-normal">(opcional)</span>
            </label>
            <select
              value={partida?.id ?? ''}
              onChange={(e) => setPartida(partidasFiltradas.find((p) => p.id === e.target.value) ?? null)}
              disabled={!etapa}
              className="mt-1 w-full border-2 border-tinta px-3 py-2.5 text-sm text-gris-medio bg-white disabled:opacity-40"
            >
              <option value="">Sin partida</option>
              {partidasFiltradas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          <button
            onClick={() => { setModoManual(false); setPaso(2) }}
            disabled={!paso1Completo}
            className="w-full bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
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

          <div className="bg-crema-header border-2 border-tinta p-3 shadow-hard-sm">
            <p className="text-xs text-dorado-link">
              📸 La foto debe mostrar el documento completo. En una boleta: los montos de cada ítem, los descuentos si hay, el IVA, los impuestos y el TOTAL. En una transferencia: quién transfiere, la cuenta de destino y el monto. La IA reconoce solo si es un gasto o un ingreso.
            </p>
          </div>

          {(errorImagen || errorAnalisis) && (
            <div className="bg-red-50 border-2 border-error p-3">
              <p className="text-sm text-error">{errorImagen || errorAnalisis}</p>
              {errorAnalisis && (
                <button
                  onClick={handleAnalizar}
                  disabled={analizando || procesandoImagen}
                  className="mt-2 text-xs font-semibold text-error disabled:opacity-40"
                >
                  Reintentar
                </button>
              )}
            </div>
          )}

          {!imagenPreview ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full h-64 border-2 border-dashed border-tinta flex flex-col items-center justify-center gap-3 text-gris-texto hover:border-tinta hover:text-dorado-link transition-colors"
            >
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-medium">Fotografiar documento</span>
              <span className="text-xs">Toca para abrir la cámara</span>
            </button>
          ) : (
            <div className="relative">
              <img src={imagenPreview} alt="Boleta capturada" className="w-full object-cover max-h-72" />
              <button
                onClick={() => {
                  setImagenPreview(null)
                  setErrorImagen(null)
                  setErrorAnalisis(null)
                  setCalidadImagen(null)
                  if (fileRef.current) fileRef.current.value = ''
                  if (fileGaleriaRef.current) fileGaleriaRef.current.value = ''
                }}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {verificandoCalidad && (
            <p className="text-xs text-gris-texto flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Revisando calidad de la imagen...
            </p>
          )}
          {!verificandoCalidad && calidadImagen && (
            calidadImagen.ok ? (
              <p className="text-sm text-green-700 bg-green-50 border-2 border-tinta p-3 shadow-hard-sm">
                ✅ Buena calidad, se ve legible.
              </p>
            ) : (
              <div className="bg-dorado/40 border-2 border-tinta p-3 shadow-hard-sm">
                <p className="text-sm text-tinta">⚠️ {calidadImagen.motivo || 'La imagen podría no verse lo suficientemente clara.'}</p>
                <p className="text-xs text-tinta mt-1">Puedes intentar analizarla igual o tomar otra foto.</p>
              </div>
            )
          )}

          <button
            onClick={() => fileGaleriaRef.current?.click()}
            className="w-full border-2 border-tinta py-2.5 text-sm text-gris-medio font-medium"
          >
            Subir desde galería
          </button>

          <button
            onClick={handleAnalizar}
            disabled={!imagenPreview || analizando || procesandoImagen}
            className="w-full bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta py-3 text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
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

          <button
            onClick={handleIngresoManual}
            className="w-full text-sm text-gris-medio font-medium py-1"
          >
            + Ingresar ítem manualmente
          </button>
        </div>
      )}

      {/* Paso 3 — ingreso de dinero (pantalla verde) */}
      {paso === 3 && tipoDoc === 'ingreso' && (
        <div className="px-4 py-5 flex flex-col gap-4">
          {imagenPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagenPreview} alt="Comprobante" className="w-full max-h-40 object-cover border-2 border-tinta" />
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase bg-white text-ingreso border-2 border-tinta rounded-full px-2.5 py-0.5">
              {ingConfianza != null ? '↓ Ingreso detectado' : 'Ingreso manual'}
            </span>
            {ingConfianza != null && (
              <span className="text-[11px] text-gris-medio font-bold uppercase">Confianza {Math.round(ingConfianza * 100)}%</span>
            )}
          </div>
          <div className="bg-white border-2 border-tinta px-3 py-2.5">
            <p className="text-xs text-tinta">
              El dinero <b>entra</b> al proyecto{proyecto ? <> <b>{proyecto.nombre}</b></> : ''}. Revisa los datos que leyó la IA; puedes corregirlos.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Quién transfirió{ingConfianza != null && ' · IA'}</label>
            <input
              type="text"
              value={ingRemitente}
              onChange={(e) => setIngRemitente(e.target.value)}
              placeholder={ingConfianza != null && !ingRemitente ? 'Sin leer — escribe quién transfirió' : 'Nombre o razón social'}
              className="mt-1 w-full border-2 border-tinta bg-white px-3 py-3 text-[15px] text-tinta min-h-[44px] focus:outline-none focus:shadow-hard-sm"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Cuenta a la que se transfirió{ingConfianza != null && ' · IA'}</label>
            <input
              type="text"
              value={ingCuenta}
              onChange={(e) => setIngCuenta(e.target.value)}
              placeholder={ingConfianza != null && !ingCuenta ? 'Sin leer — escribe la cuenta' : 'Ej: Cuenta Vista ···4821'}
              className="mt-1 w-full border-2 border-tinta bg-white px-3 py-3 text-[15px] text-tinta min-h-[44px] focus:outline-none focus:shadow-hard-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Monto{ingConfianza != null && ' · IA'}</label>
              <InputMonto className="mt-1" value={ingMonto} onChange={setIngMonto} />
            </div>
            <div>
              <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Fecha</label>
              <input
                type="date"
                value={ingFecha}
                onChange={(e) => setIngFecha(e.target.value)}
                className="mt-1 w-full border-2 border-tinta bg-white px-3 py-3 text-[15px] text-tinta min-h-[44px]"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">Proyecto</label>
            <select
              value={proyecto?.id ?? ''}
              onChange={(e) => handleProyectoChange(e.target.value)}
              className="mt-1 w-full border-2 border-tinta bg-white px-3 py-3 text-sm text-tinta min-h-[44px]"
            >
              {proyectos.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gris-medio uppercase tracking-wide">
              Nota <span className="text-gris-texto font-normal normal-case">(opcional)</span>
            </label>
            <input
              type="text"
              value={ingNota}
              onChange={(e) => setIngNota(e.target.value)}
              placeholder="Ej: primer aporte"
              className="mt-1 w-full border-2 border-tinta bg-white px-3 py-3 text-[15px] text-tinta min-h-[44px] focus:outline-none focus:shadow-hard-sm"
            />
          </div>

          {!puedeRegistrarIngresos && (
            <div className="bg-dorado/40 border-2 border-tinta p-3">
              <p className="text-sm text-tinta">Tu usuario no puede registrar ingresos. Pídele a un administrador que lo cargue.</p>
            </div>
          )}
          {ingErrorGuardar && (
            <div className="bg-error/10 border-2 border-error p-3">
              <p className="text-sm text-error">{ingErrorGuardar}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={handleCancelar}>Cancelar</Button>
            <Button
              className="flex-[1.4] !bg-ingreso !text-white"
              onClick={handleGuardarIngreso}
              disabled={guardando || !puedeRegistrarIngresos || !proyecto || !ingRemitente.trim() || !(Number(ingMonto) > 0)}
            >
              {guardando ? 'Guardando...' : 'Guardar ingreso'}
            </Button>
          </div>
          <button onClick={cambiarAGasto} className="text-xs font-bold text-gris-medio underline text-center">
            ¿No es un ingreso? Cargarlo como gasto
          </button>
        </div>
      )}

      {/* Paso 3, sub-fase "revisión de totales" — compuerta real: no se llega
          al etiquetado con números que no cuadran. Se puede corregir acá
          mismo (total e ítems editables), volver a sacar la foto, o continuar
          con descuadre solo mediante confirmación explícita. */}
      {paso === 3 && tipoDoc === 'gasto' && revisionTotales && (() => {
        const cruceRevision = calcularCruce(items, totalBoleta, interpretacionPrecios ?? 'bruto')
        return (
        <div className="px-4 py-5 flex flex-col gap-4">
          {!gastoIdReescaneo && (
            <div className="bg-white border-2 border-tinta px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-tinta">Se leyó como <b>gasto</b> (sale dinero).</span>
              <button onClick={cambiarAIngreso} className="text-xs font-bold text-dorado-link underline shrink-0">Es un ingreso</button>
            </div>
          )}
          {requiereAtencion && (
            <div className="bg-dorado/40 border-2 border-tinta p-3 shadow-hard-sm">
              <p className="text-sm text-tinta">
                ⚠ La IA tuvo baja confianza al leer esta boleta. Revisa con cuidado los datos y montos antes de continuar.
              </p>
            </div>
          )}

          {!!descuentoGeneralMonto && (
            <div className="bg-crema-header border-2 border-tinta p-3 shadow-hard-sm">
              <p className="text-sm text-dorado-link">
                🏷 Esta boleta tiene un descuento general de {formatCLP(descuentoGeneralMonto)}
                {descuentoGeneralDescripcion ? ` (${descuentoGeneralDescripcion})` : ''}, ya repartido en los montos de cada ítem.
              </p>
            </div>
          )}

          <CruceItemsTotal
            items={items}
            total={totalBoleta}
            interpretacion={interpretacionPrecios}
            ivaImpreso={ivaImpreso}
            otrosImpuestos={otrosImpuestos}
            variante="detallada"
          />

          {/* Montos editables: corregir acá mismo hasta que cuadre */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-gris-texto uppercase tracking-wide">Montos por ítem (editables)</p>
            {items.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2">
                <span className="truncate flex-1 text-xs text-gris-medio">
                  {i.descripcion}
                  {!!i.descuento_monto && (
                    <span className="text-[10px] text-gris-texto"> · desc −{formatCLP(i.descuento_monto)}</span>
                  )}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={i.subtotal}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setItems((prev) => prev.map((x, idx2) => idx2 === idx ? { ...x, subtotal: v } : x))
                  }}
                  className="w-24 border-2 border-tinta px-2 py-1 text-right text-xs text-gris-medio bg-white"
                />
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t-2 border-tinta">
              <span className="text-xs font-semibold text-gris-medio">Total boleta</span>
              <input
                type="number"
                inputMode="numeric"
                value={totalBoleta}
                onChange={(e) => setTotalBoleta(Number(e.target.value))}
                className="w-28 border-2 border-tinta px-2 py-1 text-right text-xs font-semibold text-tinta bg-white"
              />
            </div>
          </div>

          {cruceRevision.cruce_valido ? (
            <button
              onClick={() => setRevisionTotales(false)}
              className="w-full bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta py-3 text-sm font-semibold"
            >
              Continuar a clasificar ítems
            </button>
          ) : (
            <div className="space-y-3">
              <button
                disabled
                className="w-full bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta py-3 text-sm font-semibold opacity-40 cursor-not-allowed"
              >
                Continuar a clasificar ítems
              </button>

              {/* Falta plata en los ítems: lo más común es un despacho cobrado
                  aparte que la IA no listó. Se ofrece agregarlo como ítem en
                  vez de arrastrar el descuadre. */}
              {totalBoleta - cruceRevision.suma_bruto > 0 && (
                <div className="space-y-2 bg-crema-header border-2 border-tinta p-3 shadow-hard-sm">
                  <p className="text-xs font-semibold text-dorado-link">¿La diferencia es un envío o cargo extra?</p>
                  <p className="text-[11px] text-dorado-link">
                    Si la boleta cobra despacho aparte y no quedó en la lista, agrégalo como ítem: la boleta cuadra y el flete queda etiquetable como cualquier material.
                  </p>
                  <div className="flex gap-2">
                    <select
                      value={tipoCargoManual}
                      onChange={(e) => setTipoCargoManual(e.target.value as 'Envío' | 'Flete' | 'Servicio')}
                      className="border-2 border-tinta px-2 py-2 text-xs bg-white text-gris-medio"
                    >
                      <option value="Envío">Envío</option>
                      <option value="Flete">Flete</option>
                      <option value="Servicio">Servicio</option>
                    </select>
                    <button
                      onClick={() => agregarCargoManual(totalBoleta - cruceRevision.suma_bruto)}
                      className="flex-1 bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta py-2 text-xs font-semibold"
                    >
                      ➕ Agregar {formatCLP(Math.round(totalBoleta - cruceRevision.suma_bruto))}
                    </button>
                  </div>
                </div>
              )}

              {!gastoIdReescaneo && (
                <div className="space-y-1.5">
                  <button
                    onClick={() => { setConfirmandoDescuadre(false); setPaso(2) }}
                    className="w-full border-2 border-tinta text-dorado-link py-3 text-sm font-semibold"
                  >
                    📷 Volver a sacar la foto
                  </button>
                  <p className="text-[11px] text-gris-texto px-1">
                    Asegúrate de que en la foto salgan los montos de cada ítem, los descuentos, el IVA, los impuestos y el TOTAL — si algo quedó cortado o borroso, la lectura falla.
                  </p>
                </div>
              )}

              {confirmandoDescuadre ? (
                <div className="space-y-2 bg-dorado/40 border-2 border-tinta p-3 shadow-hard-sm">
                  <p className="text-xs text-tinta">
                    ¿Continuar igual con un descuadre de {formatCLP(Math.round(cruceRevision.diferencia))}? La boleta quedará marcada con este descuadre y los montos por producto pueden no reflejar lo realmente pagado.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmandoDescuadre(false); setRevisionTotales(false) }}
                      className="flex-1 bg-amber-500 text-white py-1.5 text-xs font-semibold border-2 border-tinta shadow-hard-sm"
                    >
                      Sí, continuar igual
                    </button>
                    <button onClick={() => setConfirmandoDescuadre(false)} className="text-xs text-gris-texto px-3">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmandoDescuadre(true)}
                  className="w-full border-2 border-tinta text-tinta py-2.5 text-xs font-semibold"
                >
                  Continuar igual con descuadre de {formatCLP(Math.round(cruceRevision.diferencia))}
                </button>
              )}
            </div>
          )}
        </div>
        )
      })()}

      {/* Paso 3, sub-fase "etiquetado" — clasificación ítem a ítem */}
      {paso === 3 && tipoDoc === 'gasto' && !revisionTotales && item && (
        <div className="px-4 py-5 flex flex-col gap-4">

          {/* Progreso */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gris-texto">
              Ítem <span className="font-semibold text-gris-medio">{itemActual + 1}</span> de {items.length}
            </span>
            <div className="flex gap-2 text-[10px]">
              <span className="bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">{confirmados} con etiqueta</span>
              {pendientes > 0 && <span className="bg-dorado/40 text-tinta font-semibold px-2 py-0.5 rounded-full">{pendientes} pendiente{pendientes > 1 ? 's' : ''}</span>}
            </div>
          </div>

          {/* Barra de progreso */}
          <div className="flex gap-1">
            {items.map((it, idx) => (
              <div
                key={idx}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  idx === itemActual ? 'bg-dorado' :
                  it.etiquetas.length > 0 ? 'bg-green-400' : 'bg-borde'
                }`}
              />
            ))}
          </div>

          {!modoManual && (
            <CruceItemsTotal items={items} total={totalBoleta} interpretacion={interpretacionPrecios} />
          )}

          {/* Datos del proveedor */}
          <div className="bg-panel p-3 border-2 border-tinta shadow-hard-sm">
            <p className="text-[10px] font-semibold text-gris-texto uppercase tracking-wide">Proveedor</p>
            {/* Siempre editable (no solo en modo manual): si la IA no pudo leer
                proveedor/RUT/fecha con confianza, los deja vacíos a propósito
                (ver prompt en analizar-boleta/route.ts) en vez de inventarlos —
                y el usuario tiene que poder completarlos acá mismo. */}
            {!modoManual && (!proveedor || !rut) && (
              <p className="text-xs font-medium text-tinta mt-1 mb-1.5">
                ⚠ La IA no pudo leer con confianza {!proveedor && !rut ? 'el proveedor ni el RUT' : !proveedor ? 'el proveedor' : 'el RUT'} de la foto — complétalo abajo, no se inventó ningún dato.
              </p>
            )}
            <div className="space-y-1.5 mt-1">
              <input
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder={!modoManual && !proveedor ? 'Sin leer — escribe el nombre del proveedor' : 'Nombre del proveedor'}
                className="w-full border-2 border-tinta px-2 py-1.5 text-sm text-gris-medio bg-white placeholder-gris-texto"
              />
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                  placeholder={!modoManual && !rut ? 'Sin leer — RUT (opcional)' : 'RUT (opcional)'}
                  className="flex-1 border-2 border-tinta px-2 py-1.5 text-xs text-gris-medio bg-white placeholder-gris-texto"
                />
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="flex-1 border-2 border-tinta px-2 py-1.5 text-xs text-gris-medio bg-white"
                />
              </div>
            </div>
            <div className="mt-2 pt-2 border-t-2 border-tinta">
              <p className="text-[10px] font-semibold text-gris-texto uppercase tracking-wide">
                Comentario <span className="text-gris-texto font-normal">(opcional)</span>
              </p>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Ej: Faltó el material de la partida X, se pidió reposición"
                rows={2}
                className="mt-1 w-full border-2 border-tinta px-2 py-1.5 text-sm text-gris-medio bg-white resize-none placeholder-gris-texto"
              />
            </div>
          </div>

          {/* Tarjeta del ítem */}
          <div className=" border-2 border-tinta bg-crema-header p-4 shadow-hard-sm">
            {/* Badge IA / manual */}
            <div className="flex items-center justify-between mb-3">
              {modoManual ? (
                <span className="text-[10px] font-bold text-gris-medio bg-borde px-2 py-0.5 rounded-full">
                  ✏️ Ingreso manual
                </span>
              ) : (
                <>
                  <span className="text-[10px] font-bold text-dorado-link bg-crema-header px-2 py-0.5 rounded-full">
                    🤖 Propuesta IA
                  </span>
                  {item.confianza < 0.7 ? (
                    <span className="text-[10px] font-bold text-tinta bg-dorado/40 px-2 py-0.5 rounded-full">
                      ⚠ Confianza {Math.round(item.confianza * 100)}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-gris-texto">
                      {Math.round(item.confianza * 100)}% confianza
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Descripción */}
            {modoManual ? (
              <div className="space-y-1.5 mb-3">
                <input
                  type="text"
                  value={item.descripcion}
                  onChange={(e) => setItemDescripcion(e.target.value)}
                  placeholder="Descripción del ítem"
                  className="w-full border-2 border-tinta px-2 py-1.5 text-base font-bold text-tinta bg-white placeholder-gris-texto"
                />
                <input
                  type="text"
                  value={item.categoria}
                  onChange={(e) => setItemCategoria(e.target.value)}
                  placeholder="Categoría (ej: Materiales, Herramientas)"
                  className="w-full border-2 border-tinta px-2 py-1 text-xs text-gris-medio bg-white placeholder-gris-texto"
                />
              </div>
            ) : (
              <>
                <p className="text-base font-bold text-tinta mb-1">{item.descripcion}</p>
                <p className="text-xs text-gris-texto mb-3">{item.categoria}</p>
              </>
            )}

            {/* Etapa y Partida por ítem */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-gris-texto uppercase tracking-wide">Etapa</p>
                  <button onClick={() => setCreandoEtapaInline(true)} className="text-[10px] text-dorado-link font-medium">+ Nueva</button>
                </div>
                {creandoEtapaInline ? (
                  <div className="flex gap-1">
                    <input
                      autoFocus
                      value={nuevaEtapaNombre}
                      onChange={(e) => setNuevaEtapaNombre(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCrearEtapaInline()}
                      placeholder="Nombre..."
                      className="flex-1 border-2 border-tinta px-2 py-1.5 text-xs text-gris-medio min-w-0"
                    />
                    <button onClick={handleCrearEtapaInline} className="bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta px-2 text-xs font-bold">✓</button>
                    <button onClick={() => { setCreandoEtapaInline(false); setNuevaEtapaNombre('') }} className="text-gris-texto text-xs px-1">✕</button>
                  </div>
                ) : (
                  <select
                    value={item.etapa_id ?? ''}
                    onChange={(e) => setItemEtapa(e.target.value)}
                    className="w-full border-2 border-tinta px-2 py-1.5 text-xs text-gris-medio bg-white"
                  >
                    <option value="">Sin etapa</option>
                    {etapasFiltradas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-gris-texto uppercase tracking-wide">Partida</p>
                  <button onClick={() => setCreandoPartidaInline(true)} className="text-[10px] text-dorado-link font-medium">+ Nueva</button>
                </div>
                {creandoPartidaInline ? (
                  <div className="flex gap-1">
                    <input
                      autoFocus
                      value={nuevaPartidaNombre}
                      onChange={(e) => setNuevaPartidaNombre(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCrearPartidaInline()}
                      placeholder="Nombre..."
                      className="flex-1 border-2 border-tinta px-2 py-1.5 text-xs text-gris-medio min-w-0"
                    />
                    <button onClick={handleCrearPartidaInline} className="bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta px-2 text-xs font-bold">✓</button>
                    <button onClick={() => { setCreandoPartidaInline(false); setNuevaPartidaNombre('') }} className="text-gris-texto text-xs px-1">✕</button>
                  </div>
                ) : (
                  <select
                    value={item.partida_id ?? ''}
                    onChange={(e) => setItemPartida(e.target.value)}
                    className="w-full border-2 border-tinta px-2 py-1.5 text-xs text-gris-medio bg-white"
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
              <div className="bg-white p-2 text-center border-2 border-tinta">
                <p className="text-[10px] text-gris-texto">Cantidad</p>
                <div className="flex items-center justify-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={item.cantidad}
                    onChange={(e) => setItemCantidad(Number(e.target.value))}
                    className="w-12 text-sm font-bold text-tinta text-right outline-none border-2 border-tinta px-1 bg-white focus:border-tinta"
                  />
                  <span className="text-sm font-bold text-tinta">{item.unidad}</span>
                </div>
              </div>
              <div className="bg-white p-2 text-center border-2 border-tinta">
                <p className="text-[10px] text-gris-texto">Precio unit.</p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.precio_unitario}
                  onChange={(e) => setItemPrecio(Number(e.target.value))}
                  className="w-full text-sm font-bold text-tinta text-center outline-none border-2 border-tinta px-1 bg-white focus:border-tinta"
                />
              </div>
              {(() => {
                const { bruto } = calcularNetoBruto(item.subtotal, interpretacionPrecios ?? 'bruto', item.exento)
                return (
                  <div className="bg-white p-2 text-center border-2 border-tinta bg-crema-header">
                    <p className="text-[10px] text-dorado-link">Subtotal</p>
                    <p className="text-sm font-bold text-dorado-link">{formatCLP(bruto)}</p>
                  </div>
                )
              })()}
            </div>

            {(() => {
              const { neto, bruto, iva } = calcularNetoBruto(item.subtotal, interpretacionPrecios ?? 'bruto', item.exento)
              return (
                <p className="text-[10px] text-gris-texto text-center mb-3">
                  {item.exento
                    ? <>Exento de IVA · {formatCLP(bruto)}</>
                    : <>Bruto {formatCLP(bruto)} (Neto {formatCLP(neto)} + IVA {formatCLP(iva)})</>}
                  {/* Solo descuentos IMPRESOS en la boleta — nunca inferidos por aritmética */}
                  {!!item.descuento_monto && <> · Desc {formatCLP(item.descuento_monto)}{item.descuento_descripcion ? ` (${item.descuento_descripcion})` : ''}</>}
                </p>
              )
            })()}

            {/* Etiquetas */}
            <div>
              <p className="text-[10px] font-semibold text-gris-texto uppercase tracking-wide mb-2">Etiquetas</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {item.etiquetas.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => removeTag(tag)}
                    className="flex items-center gap-1 bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta text-xs px-2.5 py-1 rounded-full font-medium hover:bg-red-500 transition-colors"
                  >
                    {tag} ×
                  </button>
                ))}
                {item.etiquetas.length === 0 && (
                  <span className="text-xs text-gris-texto italic">Sin etiquetas — quedará pendiente</span>
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
                  className="w-full border-2 border-tinta px-3 py-2 text-sm text-gris-medio placeholder-gris-texto outline-none focus:border-tinta"
                />

                {/* Sugerencias */}
                {mostrarSugerencias && sugerenciasFiltradas.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-tinta shadow-hard-sm z-10 max-h-48 overflow-y-auto overscroll-contain">
                    {sugerenciasFiltradas.map((t) => (
                      <button
                        key={t}
                        onMouseDown={() => addTag(t)}
                        className="w-full text-left px-3 py-2 text-sm text-gris-medio hover:bg-crema-header hover:text-dorado-link border-b-2 border-tinta last:border-0"
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
                  className="mt-1.5 text-xs text-dorado-link font-medium px-2"
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
              className="flex-1 border-2 border-tinta py-3 text-sm font-semibold text-gris-medio disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              onClick={handleSiguiente}
              disabled={guardando}
              className={`flex-1 py-3 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${
                esUltimo ? 'bg-green-600' : 'bg-tinta'
              }`}
            >
              {guardando ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {usuarioActual?.rol === 'usuario' ? 'Enviando...' : 'Guardando...'}
                </>
              ) : esUltimo ? (usuarioActual?.rol === 'usuario' ? 'Enviar a aprobación' : 'Guardar boleta') : 'Siguiente'}
            </button>
          </div>

          {/* Resumen al final */}
          {esUltimo && (
            <div className="bg-panel p-3 border-2 border-tinta text-xs text-gris-medio text-center shadow-hard-sm">
              Al guardar: <span className="font-semibold text-green-700">{confirmados} ítems confirmados</span>
              {pendientes > 0 && <> · <span className="font-semibold text-tinta">{pendientes} quedarán pendientes</span></>}
            </div>
          )}
        </div>
      )}

      <BottomSheet open={confirmandoCancelar} onClose={() => setConfirmandoCancelar(false)} title="¿Cancelar esta operación?" labelListo={null}>
        <p className="text-sm text-tinta">Se descartará la foto y los datos que llevas cargados. No se guardará nada.</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmandoCancelar(false)}>Seguir aquí</Button>
          <Button className="flex-1 !bg-error !text-white" onClick={() => router.push('/')}>Sí, cancelar</Button>
        </div>
      </BottomSheet>
    </div>
  )
}

export default function Scan() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-gris-texto text-sm">Cargando...</p></div>}>
      <ScanContenido />
    </Suspense>
  )
}
