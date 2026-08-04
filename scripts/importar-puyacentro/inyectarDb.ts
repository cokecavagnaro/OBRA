import fs from 'fs'
import path from 'path'
import { createAdminClient } from '../qa/env'
import { aplicarEtiquetas, FacturaConEtiquetas } from '../../lib/importacion/aplicarEtiquetas'
import type { FacturaPuya } from '../../lib/importacion/parsearFacturaPuya'

const NOMBRE_PROYECTO = 'Casa Chago Lion'
// Admin creado en la cuenta real de Santiago Leon ("Constructora Guay Guay")
// para esta importación — ver conversación: no se reusa ningún usuario de
// la cuenta de Jorge, esto vive en la cuenta del cliente.
const EMAIL_ADMIN = 'cokecavagnaro+guayguay@gmail.com'

async function obtenerOCrearProyecto(supabase: ReturnType<typeof createAdminClient>, cuentaId: string, userId: string): Promise<string> {
  const { data: existente } = await supabase
    .from('proyectos')
    .select('id')
    .eq('nombre', NOMBRE_PROYECTO)
    .maybeSingle()
  if (existente) return existente.id

  const { data: creado, error } = await supabase
    .from('proyectos')
    .insert({ nombre: NOMBRE_PROYECTO, system_prompt: '', user_id: userId, cuenta_id: cuentaId, presupuesto: null })
    .select('id')
    .single()
  if (error || !creado) throw new Error(`No se pudo crear el proyecto: ${error?.message}`)
  console.log(`Proyecto creado: ${NOMBRE_PROYECTO} (${creado.id})`)
  return creado.id
}

async function subirPdf(supabase: ReturnType<typeof createAdminClient>, cuentaId: string, proyectoId: string, numero: string, rutaPdf: string): Promise<string> {
  const buffer = fs.readFileSync(rutaPdf)
  const path_ = `${cuentaId}/${proyectoId}/factura-puya-${numero}.pdf`
  const { error } = await supabase.storage.from('boletas').upload(path_, buffer, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`No se pudo subir el PDF de la factura ${numero}: ${error.message}`)
  const { data } = supabase.storage.from('boletas').getPublicUrl(path_)
  return data.publicUrl
}

async function yaExiste(supabase: ReturnType<typeof createAdminClient>, proyectoId: string, numero: string): Promise<boolean> {
  const { data } = await supabase
    .from('gastos')
    .select('id')
    .eq('proyecto_id', proyectoId)
    .eq('contexto_boleta', `Importado de Puya Centro - Factura N° ${numero}`)
    .maybeSingle()
  return !!data
}

async function insertarGasto(
  supabase: ReturnType<typeof createAdminClient>,
  proyectoId: string,
  solicitanteId: string,
  factura: FacturaConEtiquetas,
  imagenUrl: string
): Promise<void> {
  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert({
      proyecto_id: proyectoId,
      proveedor: factura.proveedor,
      rut_proveedor: factura.rutProveedor,
      fecha_boleta: factura.fecha,
      total: factura.total,
      imagen_url: imagenUrl,
      contexto_boleta: `Importado de Puya Centro - Factura N° ${factura.numero}`,
      creado_por_email: EMAIL_ADMIN,
      comentario: null,
      interpretacion_precios: 'bruto',
      iva_impreso: factura.iva,
      otros_impuestos: null,
      fuente_interpretacion: 'iva_impreso',
      descuento_general_monto: null,
      descuento_general_descripcion: null,
      // 'confirmado', no 'pendiente': el ítem ya trae su etiqueta final
      // (Task 5) — falta solo etapa/partida, que es opcional a propósito,
      // no una "pendiente" a mostrar en /pendientes.
      estado: 'confirmado',
      estado_aprobacion: 'aprobado',
      solicitante_id: solicitanteId,
      fecha_solicitud: null,
    })
    .select('id')
    .single()
  if (error || !gasto) throw new Error(`No se pudo insertar el gasto de la factura ${factura.numero}: ${error?.message}`)

  const { error: errorItems } = await supabase.from('items_gasto').insert(
    factura.items.map((item) => ({
      gasto_id: gasto.id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      unidad: 'un',
      precio_unitario: item.precio_unitario,
      subtotal: item.subtotal,
      categoria: item.categoria,
      etiquetas: item.etiquetas,
      confianza_ia: 1,
      etapa_id: null,
      partida_id: null,
      estado: 'confirmado',
      descuento_monto: null,
      descuento_descripcion: null,
      exento: false,
    }))
  )
  if (errorItems) {
    // Sin esto, un gasto sin ítems queda huérfano y además bloquea
    // reintentos futuros (yaExiste lo encontraría y lo saltaría para siempre).
    await supabase.from('gastos').delete().eq('id', gasto.id)
    throw new Error(`No se pudieron insertar los ítems de la factura ${factura.numero}: ${errorItems.message}`)
  }

  console.log(`  ${factura.numero}: gasto ${gasto.id} — ${factura.items.length} ítems — $${factura.total}`)
}

async function main() {
  const supabase = createAdminClient()

  const { data: admin, error: errorAdmin } = await supabase
    .from('usuarios')
    .select('id, cuenta_id, rol')
    .eq('email', EMAIL_ADMIN)
    .single()
  if (errorAdmin || !admin) throw new Error(`No se encontró el usuario admin ${EMAIL_ADMIN}: ${errorAdmin?.message}`)
  if (admin.rol === 'usuario') {
    throw new Error(`El usuario ${EMAIL_ADMIN} tiene rol 'usuario' — las boletas quedarían pendientes de aprobación en vez de aprobadas automáticamente. Se esperaba 'admin' o 'super_admin'.`)
  }

  const proyectoId = await obtenerOCrearProyecto(supabase, admin.cuenta_id, admin.id)

  const facturas: FacturaPuya[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'facturas-parseadas.json'), 'utf-8')
  )
  const etiquetas = JSON.parse(fs.readFileSync(path.join(__dirname, 'etiquetas.json'), 'utf-8'))
  const facturasConEtiquetas = aplicarEtiquetas(facturas, etiquetas)

  console.log(`Insertando ${facturasConEtiquetas.length} facturas en el proyecto "${NOMBRE_PROYECTO}"...`)
  for (const factura of facturasConEtiquetas) {
    if (await yaExiste(supabase, proyectoId, factura.numero)) {
      console.log(`  ${factura.numero}: ya estaba importada, se salta`)
      continue
    }
    const rutaPdf = path.join(__dirname, 'pdfs', `${factura.numero}.pdf`)
    const imagenUrl = await subirPdf(supabase, admin.cuenta_id, proyectoId, factura.numero, rutaPdf)
    await insertarGasto(supabase, proyectoId, admin.id, factura, imagenUrl)
  }
  console.log('Listo.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
