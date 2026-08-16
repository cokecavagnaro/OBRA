// Fase 2 de la herramienta de import masivo de boletas: toma el lote que
// generó extraer.ts (datos.json + revisar.xlsx ya completado por una
// persona) e inserta los gastos/ítems definitivos en Supabase.
//
// Uso:
//   npx tsx scripts/importar-fotos/inyectar.ts scripts/importar-fotos/lotes/<carpeta-del-lote> [--dry-run]

import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { normalizarDescripcion } from '../../lib/aprendizaje'
import { createAdminClient, detectarMediaType, parsearArgs, upsertClasificacionAprendidaAdmin } from './comun'

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

interface DatosLote {
  proyectoId: string
  cuentaId: string
  adminId: string
  creadoPorEmail: string
  resultados: BoletaExtraida[]
}

interface FilaExcel {
  archivo: string
  item: number
  categoria: string
  etiqueta: string
  excluir: string
}

async function main() {
  const { flags, posicionales } = parsearArgs(process.argv.slice(2))
  const carpetaLote = posicionales[0]
  const dryRun = flags['dry-run'] === 'true'

  if (!carpetaLote) {
    console.error('Uso: npx tsx scripts/importar-fotos/inyectar.ts <carpeta-del-lote> [--dry-run]')
    process.exit(1)
  }

  const datos: DatosLote = JSON.parse(fs.readFileSync(path.join(carpetaLote, 'datos.json'), 'utf-8'))
  const wb = XLSX.readFile(path.join(carpetaLote, 'revisar.xlsx'))
  const filas = XLSX.utils.sheet_to_json<FilaExcel>(wb.Sheets['Items'])

  const filasPorClave = new Map<string, FilaExcel>()
  for (const fila of filas) filasPorClave.set(`${fila.archivo}#${fila.item}`, fila)

  const supabase = createAdminClient()

  let importadas = 0
  let saltadasYaExistian = 0
  let saltadasSinItems = 0
  let itemsExcluidos = 0
  const fallidas: Array<{ archivo: string; motivo: string }> = []

  for (const boleta of datos.resultados) {
    try {
      const itemsFinal: Array<ItemExtraido> = []
      boleta.items.forEach((item, idx) => {
        const fila = filasPorClave.get(`${boleta.archivo}#${idx}`)
        if (!fila) {
          console.log(`  ⚠ ${boleta.archivo} ítem ${idx}: no está en el Excel, se excluye por seguridad`)
          itemsExcluidos++
          return
        }
        if (fila.excluir && String(fila.excluir).trim() !== '') {
          itemsExcluidos++
          return
        }
        const etiquetas = String(fila.etiqueta ?? '')
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
        itemsFinal.push({ ...item, categoria: String(fila.categoria ?? item.categoria), etiquetas })
      })

      if (itemsFinal.length === 0) {
        console.log(`  – ${boleta.archivo}: sin ítems tras la revisión (excluida por completo), se salta`)
        saltadasSinItems++
        continue
      }

      const contextoBoleta = `Importado de fotos - ${boleta.archivo}`
      const { data: existente } = await supabase
        .from('gastos')
        .select('id')
        .eq('proyecto_id', datos.proyectoId)
        .eq('contexto_boleta', contextoBoleta)
        .maybeSingle()
      if (existente) {
        console.log(`  – ${boleta.archivo}: ya estaba importada (gasto ${existente.id}), se salta`)
        saltadasYaExistian++
        continue
      }

      const buffer = fs.readFileSync(boleta.rutaOriginal)
      const detectado = detectarMediaType(buffer)
      if (!detectado) throw new Error('formato no soportado al reinyectar (¿se movió/editó el archivo original?)')

      const nombreBase = path.basename(boleta.archivo, path.extname(boleta.archivo))
      const pathStorage = `${datos.cuentaId}/${datos.proyectoId}/boleta-${nombreBase}.${detectado.ext}`

      const hoy = new Date().toISOString().split('T')[0]
      const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(boleta.fecha_boleta) ? boleta.fecha_boleta : hoy
      const estado = itemsFinal.every((i) => i.etiquetas.length > 0) ? 'confirmado' : 'pendiente'

      if (dryRun) {
        console.log(`  [dry-run] ${boleta.archivo}: insertaría gasto ${boleta.proveedor || '(sin proveedor)'} — $${boleta.total} — ${itemsFinal.length} ítem(s) — estado=${estado}`)
        importadas++
        continue
      }

      const { error: errorUpload } = await supabase.storage.from('boletas').upload(pathStorage, buffer, { contentType: detectado.mediaType, upsert: true })
      if (errorUpload) throw new Error(`no se pudo subir a Storage: ${errorUpload.message}`)
      const { data: publicUrlData } = supabase.storage.from('boletas').getPublicUrl(pathStorage)

      const { data: gasto, error: errorGasto } = await supabase
        .from('gastos')
        .insert({
          proyecto_id: datos.proyectoId,
          proveedor: boleta.proveedor || 'Sin proveedor',
          rut_proveedor: boleta.rut_proveedor || '',
          fecha_boleta: fechaValida,
          total: boleta.total,
          imagen_url: publicUrlData.publicUrl,
          contexto_boleta: contextoBoleta,
          creado_por_email: datos.creadoPorEmail,
          comentario: null,
          interpretacion_precios: boleta.interpretacion_precios ?? 'bruto',
          iva_impreso: boleta.iva_impreso,
          otros_impuestos: boleta.otros_impuestos,
          fuente_interpretacion: boleta.fuente_interpretacion,
          descuento_general_monto: boleta.descuento_general_monto,
          descuento_general_descripcion: boleta.descuento_general_descripcion,
          estado,
          estado_aprobacion: 'aprobado',
          solicitante_id: datos.adminId,
          fecha_solicitud: null,
        })
        .select('id')
        .single()
      if (errorGasto || !gasto) throw new Error(`no se pudo insertar el gasto: ${errorGasto?.message}`)

      const { error: errorItems } = await supabase.from('items_gasto').insert(
        itemsFinal.map((item) => ({
          gasto_id: gasto.id,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal,
          categoria: item.categoria,
          etiquetas: item.etiquetas,
          confianza_ia: item.confianza,
          etapa_id: null,
          partida_id: null,
          estado: item.etiquetas.length > 0 ? 'confirmado' : 'pendiente',
          descuento_monto: item.descuento_monto,
          descuento_descripcion: item.descuento_descripcion,
          exento: item.exento,
        }))
      )
      if (errorItems) {
        await supabase.from('gastos').delete().eq('id', gasto.id)
        await supabase.storage.from('boletas').remove([pathStorage])
        throw new Error(`no se pudieron insertar los ítems (se revirtió el gasto y el archivo subido): ${errorItems.message}`)
      }

      for (const item of itemsFinal) {
        if (item.etiquetas.length === 0) continue
        const normalizada = normalizarDescripcion(item.descripcion)
        const { data: existenteAprendida } = await supabase
          .from('clasificaciones_aprendidas')
          .select('veces_confirmado')
          .eq('proyecto_id', datos.proyectoId)
          .eq('descripcion_normalizada', normalizada)
          .maybeSingle()
        await upsertClasificacionAprendidaAdmin(supabase, datos.proyectoId, normalizada, item.categoria, item.etiquetas, existenteAprendida?.veces_confirmado ?? 0)
      }

      console.log(`  ✓ ${boleta.archivo}: gasto ${gasto.id} — ${itemsFinal.length} ítem(s) — $${boleta.total} — estado=${estado}`)
      importadas++
    } catch (err) {
      console.error(`  ✗ ${boleta.archivo}: ${(err as Error).message}`)
      fallidas.push({ archivo: boleta.archivo, motivo: (err as Error).message })
    }
  }

  console.log(`\n${dryRun ? '[dry-run] ' : ''}Importadas: ${importadas}. Ya existían: ${saltadasYaExistian}. Sin ítems tras revisión: ${saltadasSinItems}. Ítems excluidos: ${itemsExcluidos}. Fallidas: ${fallidas.length}.`)
  if (fallidas.length > 0) {
    console.log('Detalle de fallidas:')
    for (const f of fallidas) console.log(`  ${f.archivo}: ${f.motivo}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
