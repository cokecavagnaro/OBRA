// Fase 1 de la herramienta de import masivo de boletas: recorre una carpeta
// de fotos/PDFs, las analiza con la misma IA que usa /scan (vía
// lib/analizarBoleta.ts), y vuelca el resultado a un Excel para que una
// persona revise/complete las etiquetas antes de cargar nada en la base.
//
// Uso:
//   npx tsx scripts/importar-fotos/extraer.ts --cuenta-email=<email admin> --proyecto="<nombre>" <carpeta> [--limit=N] [--dry-run]

import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { analizarBoletaImagen } from '../../lib/analizarBoleta'
import { normalizarDescripcion } from '../../lib/aprendizaje'
import type { ClasificacionAprendida } from '../../lib/types'
import { createAdminClient, resolverAdmin, obtenerOCrearProyecto, detectarMediaType, listarArchivos, parsearArgs } from './comun'

interface ItemExtraido {
  descripcion: string
  cantidad: number
  unidad: string
  precio_unitario: number
  subtotal: number
  categoria: string
  etiquetas: string[]
  confianza: number
  exento: boolean
  descuento_monto: number | null
  descuento_descripcion: string | null
}

interface BoletaExtraida {
  archivo: string
  rutaOriginal: string
  proveedor: string
  rut_proveedor: string
  fecha_boleta: string
  total: number
  interpretacion_precios?: string
  iva_impreso: number | null
  otros_impuestos: number | null
  fuente_interpretacion: string | null
  descuento_general_monto: number | null
  descuento_general_descripcion: string | null
  items: ItemExtraido[]
}

async function main() {
  const { flags, posicionales } = parsearArgs(process.argv.slice(2))
  const carpeta = posicionales[0]
  const cuentaEmail = flags['cuenta-email']
  const nombreProyecto = flags['proyecto']

  if (!carpeta || !cuentaEmail || !nombreProyecto) {
    console.error('Uso: npx tsx scripts/importar-fotos/extraer.ts --cuenta-email=<email> --proyecto="<nombre>" <carpeta> [--limit=N] [--dry-run]')
    process.exit(1)
  }

  const limit = flags['limit'] ? parseInt(flags['limit'], 10) : undefined
  const dryRun = flags['dry-run'] === 'true'

  const supabase = createAdminClient()
  const admin = await resolverAdmin(supabase, cuentaEmail)
  const proyectoId = await obtenerOCrearProyecto(supabase, admin.cuenta_id, admin.id, nombreProyecto)

  const { data: aprendidasData } = await supabase.from('clasificaciones_aprendidas').select('*').eq('proyecto_id', proyectoId)
  const aprendidas: ClasificacionAprendida[] = aprendidasData ?? []

  let archivos = listarArchivos(carpeta)
  if (limit) archivos = archivos.slice(0, limit)

  console.log(`Procesando ${archivos.length} archivo(s) de "${carpeta}" para el proyecto "${nombreProyecto}"...`)

  const resultados: BoletaExtraida[] = []
  const fallidas: Array<{ archivo: string; motivo: string }> = []

  for (const archivo of archivos) {
    const rutaOriginal = path.join(carpeta, archivo)
    try {
      const buffer = fs.readFileSync(rutaOriginal)
      const detectado = detectarMediaType(buffer)
      if (!detectado) {
        console.log(`  ✗ ${archivo}: formato no soportado (¿HEIC/HEIF? pedir que se reenvíe como JPEG/PNG/PDF)`)
        fallidas.push({ archivo, motivo: 'formato no soportado' })
        continue
      }

      const base64 = buffer.toString('base64')
      const contexto = `Importado de fotos - ${archivo}`
      const resultado = await analizarBoletaImagen(base64, detectado.mediaType, aprendidas, contexto)

      const items: ItemExtraido[] = (resultado.items ?? []).map((i) => ({
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        unidad: i.unidad || 'un',
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal,
        categoria: i.categoria,
        etiquetas: i.etiquetas ?? [],
        confianza: i.confianza,
        exento: i.exento ?? false,
        descuento_monto: i.descuento_monto ?? null,
        descuento_descripcion: i.descuento_descripcion ?? null,
      }))

      resultados.push({
        archivo,
        rutaOriginal,
        proveedor: resultado.proveedor || '',
        rut_proveedor: resultado.rut || '',
        fecha_boleta: resultado.fecha || '',
        total: resultado.total ?? 0,
        interpretacion_precios: resultado.interpretacion_precios,
        iva_impreso: resultado.iva_impreso ?? null,
        otros_impuestos: resultado.otros_impuestos ?? null,
        fuente_interpretacion: resultado.fuente_interpretacion ?? null,
        descuento_general_monto: resultado.descuento_general_monto ?? null,
        descuento_general_descripcion: resultado.descuento_general_descripcion ?? null,
        items,
      })

      // Aprendizaje en memoria (no se escribe en la tabla acá — eso pasa en
      // inyectar.ts, recién cuando el usuario confirmó las etiquetas).
      for (const item of items) {
        if (item.etiquetas.length === 0) continue
        const normalizada = normalizarDescripcion(item.descripcion)
        const idx = aprendidas.findIndex((a) => a.descripcion_normalizada === normalizada)
        if (idx >= 0) {
          aprendidas[idx] = { ...aprendidas[idx], categoria: item.categoria, etiquetas: item.etiquetas }
        } else {
          aprendidas.push({
            id: 'temp',
            proyecto_id: proyectoId,
            descripcion_normalizada: normalizada,
            categoria: item.categoria,
            etiquetas: item.etiquetas,
            veces_confirmado: 1,
            updated_at: new Date().toISOString(),
          })
        }
      }

      console.log(`  ✓ ${archivo}: ${resultado.proveedor || '(sin proveedor)'} — ${items.length} ítem(s) — $${resultado.total}`)
    } catch (err) {
      console.error(`  ✗ ${archivo}: ${(err as Error).message}`)
      fallidas.push({ archivo, motivo: (err as Error).message })
    }
  }

  // Detección de posibles duplicados por contenido (rut + fecha + total).
  const grupos = new Map<string, string[]>()
  for (const r of resultados) {
    const clave = `${r.rut_proveedor}|${r.fecha_boleta}|${r.total}`
    grupos.set(clave, [...(grupos.get(clave) ?? []), r.archivo])
  }
  const duplicados = Array.from(grupos.entries()).filter(([, lista]) => lista.length > 1)

  if (dryRun) {
    console.log('\n--dry-run: no se escribió ningún archivo. Resumen:')
    for (const r of resultados) console.log(`  ${r.archivo}: ${r.proveedor || '(sin proveedor)'} — $${r.total} — ${r.items.length} ítem(s)`)
    if (duplicados.length > 0) {
      console.log('\nPosibles duplicados (mismo rut+fecha+total en más de un archivo):')
      for (const [clave, lista] of duplicados) console.log(`  ${clave}: ${lista.join(', ')}`)
    }
    console.log(`\nFallidas: ${fallidas.length}.`)
    for (const f of fallidas) console.log(`  ${f.archivo}: ${f.motivo}`)
    return
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const slug = nombreProyecto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const carpetaLote = path.join(__dirname, 'lotes', `${slug}-${timestamp}`)
  fs.mkdirSync(carpetaLote, { recursive: true })

  fs.writeFileSync(
    path.join(carpetaLote, 'datos.json'),
    JSON.stringify({ proyectoId, cuentaId: admin.cuenta_id, adminId: admin.id, creadoPorEmail: cuentaEmail, resultados }, null, 2)
  )

  const filasItems = resultados.flatMap((r) =>
    r.items.map((item, idx) => ({
      archivo: r.archivo,
      item: idx,
      proveedor: r.proveedor,
      fecha: r.fecha_boleta,
      total_boleta: r.total,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      unidad: item.unidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
      categoria: item.categoria,
      etiqueta: item.etiquetas[0] ?? '',
      excluir: '',
    }))
  )
  const filasDuplicados = duplicados.map(([clave, lista]) => {
    const [rut, fecha, total] = clave.split('|')
    return { rut_proveedor: rut, fecha, total, archivos: lista.join(', ') }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasItems), 'Items')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDuplicados), 'Posibles duplicados')
  const rutaExcel = path.join(carpetaLote, 'revisar.xlsx')
  XLSX.writeFile(wb, rutaExcel)

  console.log(`\nProcesadas: ${resultados.length}. Fallidas: ${fallidas.length}.`)
  if (fallidas.length > 0) {
    console.log('Detalle de fallidas:')
    for (const f of fallidas) console.log(`  ${f.archivo}: ${f.motivo}`)
  }
  if (duplicados.length > 0) {
    console.log(`Posibles duplicados detectados: ${duplicados.length} grupo(s) — revisar hoja "Posibles duplicados" en el Excel.`)
  }
  console.log(`\nExcel para revisar: ${rutaExcel}`)
  console.log(`Cuando esté completo: npx tsx scripts/importar-fotos/inyectar.ts ${path.relative(process.cwd(), carpetaLote)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
