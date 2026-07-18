import { createClient } from './client'
import { normalizarDescripcion } from '../aprendizaje'
import { determinarInterpretacion, calcularNetoBruto, type InterpretacionPrecio } from '../confianzaDocumento'
import type { Proyecto, Etapa, Partida, Gasto, ClasificacionAprendida, Usuario, Invitacion, PermissionOverride, Cuenta, EstadoItem } from '../types'
import type { PermisoKey } from '../permisos'

// ---- Usuarios / cuenta ----

export async function getUsuarioActual(): Promise<Usuario | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('usuarios').select('*').eq('id', user.id).single()
  return data as Usuario | null
}

export async function getUsuariosDeCuenta(cuentaId: string): Promise<Usuario[]> {
  const supabase = createClient()
  const { data } = await supabase.from('usuarios').select('*').eq('cuenta_id', cuentaId).order('created_at')
  return (data ?? []) as Usuario[]
}

export async function actualizarRolUsuario(id: string, rol: 'admin' | 'usuario'): Promise<void> {
  const supabase = createClient()
  await supabase.from('usuarios').update({ rol }).eq('id', id)
}

export async function darDeBajaUsuario(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('usuarios').update({ activo: false }).eq('id', id)
}

export async function reactivarUsuario(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('usuarios').update({ activo: true }).eq('id', id)
}

export async function updateCuentaNombre(cuentaId: string, nombre: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('cuentas').update({ nombre }).eq('id', cuentaId)
}

export async function getCuenta(cuentaId: string): Promise<Cuenta | null> {
  const supabase = createClient()
  const { data } = await supabase.from('cuentas').select('*').eq('id', cuentaId).single()
  return data as Cuenta | null
}

// ---- Invitaciones ----

export async function crearInvitacion(
  email: string,
  rol: 'admin' | 'usuario',
  overrides: { permission_key: PermisoKey; granted: boolean }[] = []
): Promise<{ ok: boolean; link?: string }> {
  // Se manda al servidor (no se llama a Supabase directo desde el navegador) porque
  // invitar a otra persona necesita la Admin API de Supabase, que requiere la
  // service role key (secreta) y no puede vivir en el cliente. No se manda ningún
  // email automático (Supabase no deja editar esa plantilla sin SMTP propio) — se
  // devuelve el link para que el admin lo copie y lo mande él mismo.
  const res = await fetch('/api/invitar-usuario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, rol, overrides }),
  })
  if (!res.ok) {
    console.error('crearInvitacion:', await res.text())
    return { ok: false }
  }
  const data = await res.json()
  return { ok: true, link: data.link }
}

export async function getInvitacionesPendientes(cuentaId: string): Promise<Invitacion[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('invitaciones')
    .select('*')
    .eq('cuenta_id', cuentaId)
    .eq('usada', false)
    .order('created_at')
  return (data ?? []) as Invitacion[]
}

export async function cancelarInvitacion(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('invitaciones').delete().eq('id', id)
}

// ---- Permisos ----

export async function getPermisosOverrides(usuarioId: string): Promise<PermissionOverride[]> {
  const supabase = createClient()
  const { data } = await supabase.from('user_permission_overrides').select('*').eq('user_id', usuarioId)
  return (data ?? []) as PermissionOverride[]
}

export async function setPermisoOverride(usuarioId: string, permiso: PermisoKey, granted: boolean): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('user_permission_overrides')
    .upsert({ user_id: usuarioId, permission_key: permiso, granted }, { onConflict: 'user_id,permission_key' })
}

// ---- Proyectos ----

export async function getProyectos(): Promise<Proyecto[]> {
  const supabase = createClient()
  const { data } = await supabase.from('proyectos').select('*').order('created_at')
  return (data ?? []) as Proyecto[]
}

export async function createProyecto(nombre: string, system_prompt = '', presupuesto?: number | null): Promise<Proyecto | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const usuarioActual = await getUsuarioActual()
  const { data, error } = await supabase
    .from('proyectos')
    .insert({ nombre, system_prompt, user_id: user.id, cuenta_id: usuarioActual?.cuenta_id, presupuesto: presupuesto ?? null })
    .select()
    .single()
  if (error) console.error('createProyecto:', error)
  return data as Proyecto | null
}

export async function updateProyectoPresupuesto(id: string, presupuesto: number | null): Promise<void> {
  const supabase = createClient()
  await supabase.from('proyectos').update({ presupuesto }).eq('id', id)
}

// Borra un proyecto completo y todo lo que depende de él. Se hace el cascade
// a mano desde la app (mismo criterio que ya usa deleteGasto con items_gasto)
// porque las tablas base (gastos/etapas/partidas) se crearon fuera de las
// migraciones versionadas y no se puede confirmar desde el repo si tienen
// ON DELETE CASCADE.
export async function deleteProyecto(proyecto: Proyecto): Promise<boolean> {
  const supabase = createClient()

  if (proyecto.cuenta_id) {
    const prefix = `${proyecto.cuenta_id}/${proyecto.id}`
    const { data: archivos } = await supabase.storage.from('boletas').list(prefix)
    if (archivos && archivos.length > 0) {
      await supabase.storage.from('boletas').remove(archivos.map((a) => `${prefix}/${a.name}`))
    }
  }

  const { data: gastos } = await supabase.from('gastos').select('id').eq('proyecto_id', proyecto.id)
  const gastoIds = (gastos ?? []).map((g) => g.id as string)
  if (gastoIds.length > 0) {
    await supabase.from('item_gasto_eventos').delete().in('gasto_id', gastoIds)
    await supabase.from('items_gasto').delete().in('gasto_id', gastoIds)
    await supabase.from('gastos').delete().in('id', gastoIds)
  }

  await supabase.from('partidas').delete().eq('proyecto_id', proyecto.id)
  await supabase.from('etapas').delete().eq('proyecto_id', proyecto.id)

  const { error } = await supabase.from('proyectos').delete().eq('id', proyecto.id)
  if (error) {
    console.error('deleteProyecto:', error)
    return false
  }
  return true
}

// ---- Etapas ----

export async function getEtapas(proyecto_id: string): Promise<Etapa[]> {
  const supabase = createClient()
  const { data } = await supabase.from('etapas').select('*').eq('proyecto_id', proyecto_id).order('orden')
  return (data ?? []) as Etapa[]
}

export async function createEtapa(proyecto_id: string, nombre: string, orden: number, presupuesto?: number | null): Promise<Etapa | null> {
  const supabase = createClient()
  const { data } = await supabase.from('etapas').insert({ proyecto_id, nombre, orden, presupuesto: presupuesto ?? null }).select().single()
  return data as Etapa | null
}

export async function updateEtapaPresupuesto(id: string, presupuesto: number | null): Promise<void> {
  const supabase = createClient()
  await supabase.from('etapas').update({ presupuesto }).eq('id', id)
}

// ---- Partidas ----

export async function getPartidas(proyecto_id: string): Promise<Partida[]> {
  const supabase = createClient()
  const { data } = await supabase.from('partidas').select('*').eq('proyecto_id', proyecto_id).order('created_at')
  return (data ?? []) as Partida[]
}

export async function createPartida(proyecto_id: string, nombre: string, etapa_id?: string, presupuesto?: number | null): Promise<Partida | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('partidas')
    .insert({ proyecto_id, nombre, etapa_id: etapa_id || null, presupuesto: presupuesto ?? null })
    .select()
    .single()
  return data as Partida | null
}

export async function updatePartidaPresupuesto(id: string, presupuesto: number | null): Promise<void> {
  const supabase = createClient()
  await supabase.from('partidas').update({ presupuesto }).eq('id', id)
}

// ---- Gastos ----

function mapGastoRow(g: Record<string, unknown>): Gasto {
  return {
    ...g,
    etapa_id: '',
    partida_id: '',
    moneda: (g.moneda as string) ?? 'CLP',
    items: ((g.items_gasto as Record<string, unknown>[]) ?? []).map((i) => ({
      ...i,
      etapa_id: (i.etapa_id as string) ?? '',
      partida_id: (i.partida_id as string) ?? '',
      confianza_ia: (i.confianza_ia as number) ?? 0,
      etiquetas: (i.etiquetas as string[]) ?? [],
    })),
    eventos: (g.item_gasto_eventos as Record<string, unknown>[]) ?? [],
  } as unknown as Gasto
}

export async function getGastos(proyecto_id: string): Promise<Gasto[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('gastos')
    .select('*, items_gasto(*), item_gasto_eventos(*)')
    .eq('proyecto_id', proyecto_id)
    .order('created_at', { ascending: false })

  if (!data) return []
  return data.map(mapGastoRow)
}

export async function getAllGastos(): Promise<Gasto[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('gastos')
    .select('*, items_gasto(*), item_gasto_eventos(*)')
    .order('created_at', { ascending: false })

  if (!data) return []
  return data.map(mapGastoRow)
}

// Recalcula gastos.total sumando el bruto real de los ítems que quedan en la
// base, usando la interpretación (neto/bruto) ya fija de esa boleta — así
// editar o borrar un ítem nunca deja el total desactualizado ni depende de
// que el cliente lo calcule con datos que pueden estar obsoletos.
async function recalcularTotalGasto(gastoId: string): Promise<number> {
  const supabase = createClient()
  const { data: gasto } = await supabase.from('gastos').select('interpretacion_precios, total').eq('id', gastoId).single()
  const { data: items } = await supabase.from('items_gasto').select('subtotal').eq('gasto_id', gastoId)
  const itemsList = (items ?? []) as { subtotal: number }[]

  let interpretacion = gasto?.interpretacion_precios as InterpretacionPrecio | null | undefined
  if (!interpretacion) {
    // Boleta creada antes de que existiera esta columna: se calcula una vez
    // con el método dinámico anterior y queda guardada para la próxima.
    const sumaExtraida = itemsList.reduce((s, i) => s + i.subtotal, 0)
    interpretacion = determinarInterpretacion(sumaExtraida, gasto?.total ?? 0)
  }

  const nuevoTotal = Math.round(
    itemsList.reduce((s, i) => s + calcularNetoBruto(i.subtotal, interpretacion as InterpretacionPrecio).bruto, 0)
  )

  await supabase.from('gastos').update({ total: nuevoTotal, interpretacion_precios: interpretacion }).eq('id', gastoId)
  return nuevoTotal
}

export async function logItemEvento(params: {
  gasto_id: string
  item_id: string | null
  descripcion_item: string
  accion: 'editado' | 'eliminado'
  subtotal_anterior: number
  subtotal_nuevo: number | null
  comentario?: string
}): Promise<void> {
  const supabase = createClient()
  const usuarioActual = await getUsuarioActual()
  await supabase.from('item_gasto_eventos').insert({
    gasto_id: params.gasto_id,
    item_id: params.item_id,
    descripcion_item: params.descripcion_item,
    accion: params.accion,
    subtotal_anterior: params.subtotal_anterior,
    subtotal_nuevo: params.subtotal_nuevo,
    comentario: params.comentario || null,
    usuario_email: usuarioActual?.email ?? '',
  })
}

export async function updateItemGasto(id: string, params: {
  etapa_id?: string | null
  partida_id?: string | null
  etiquetas?: string[]
  cantidad?: number
  precio_unitario?: number
  subtotal?: number
  estado?: EstadoItem
}, comentario?: string): Promise<{ ok: boolean; nuevoTotal?: number }> {
  const supabase = createClient()
  const { data: itemActual } = await supabase
    .from('items_gasto')
    .select('gasto_id, subtotal, descripcion')
    .eq('id', id)
    .single()

  const update: Record<string, unknown> = {
    etapa_id: params.etapa_id ?? null,
    partida_id: params.partida_id ?? null,
    etiquetas: params.etiquetas ?? [],
  }
  if (params.cantidad !== undefined) update.cantidad = params.cantidad
  if (params.precio_unitario !== undefined) update.precio_unitario = params.precio_unitario
  if (params.subtotal !== undefined) update.subtotal = params.subtotal
  if (params.estado !== undefined) update.estado = params.estado

  const { error } = await supabase
    .from('items_gasto')
    .update(update)
    .eq('id', id)
  if (error) {
    console.error('updateItemGasto:', error)
    return { ok: false }
  }

  let nuevoTotal: number | undefined
  if (itemActual && params.subtotal !== undefined && params.subtotal !== itemActual.subtotal) {
    await logItemEvento({
      gasto_id: itemActual.gasto_id,
      item_id: id,
      descripcion_item: itemActual.descripcion,
      accion: 'editado',
      subtotal_anterior: itemActual.subtotal,
      subtotal_nuevo: params.subtotal,
      comentario,
    })
    nuevoTotal = await recalcularTotalGasto(itemActual.gasto_id)
  }

  return { ok: true, nuevoTotal }
}

export async function subirImagenBoleta(cuentaId: string, proyectoId: string, blob: Blob): Promise<string | null> {
  const supabase = createClient()
  const path = `${cuentaId}/${proyectoId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('boletas').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) {
    console.error('subirImagenBoleta:', error)
    return null
  }
  const { data } = supabase.storage.from('boletas').getPublicUrl(path)
  return data.publicUrl
}

export async function saveGasto(params: {
  proyecto_id: string
  proveedor: string
  rut_proveedor: string
  fecha_boleta: string
  total: number
  imagen_url: string
  contexto_boleta: string
  creado_por_email: string | null
  comentario: string | null
  interpretacion_precios?: InterpretacionPrecio
  items: Array<{
    descripcion: string
    cantidad: number
    unidad: string
    precio_unitario: number
    subtotal: number
    categoria: string
    etiquetas: string[]
    confianza_ia: number
    etapa_id?: string
    partida_id?: string
    estado: string
  }>
}): Promise<string | null> {
  const supabase = createClient()

  const estado = params.items.every((i) => i.estado === 'confirmado') ? 'confirmado' : 'pendiente'
  const hoy = new Date().toISOString().split('T')[0]
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(params.fecha_boleta) ? params.fecha_boleta : hoy
  const totalValido = typeof params.total === 'number' && params.total > 0
    ? params.total
    : params.items.reduce((s, i) => s + (i.subtotal || 0), 0)

  const sumaItems = params.items.reduce((s, i) => s + (i.subtotal || 0), 0)
  const interpretacion = params.interpretacion_precios ?? determinarInterpretacion(sumaItems, totalValido)

  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert({
      proyecto_id: params.proyecto_id,
      proveedor: params.proveedor || 'Sin proveedor',
      rut_proveedor: params.rut_proveedor || '',
      fecha_boleta: fechaValida,
      total: totalValido,
      imagen_url: params.imagen_url,
      contexto_boleta: params.contexto_boleta,
      creado_por_email: params.creado_por_email,
      comentario: params.comentario,
      interpretacion_precios: interpretacion,
      estado,
    })
    .select()
    .single()

  if (error || !gasto) {
    console.error('Error saving gasto:', error)
    return null
  }

  if (params.items.length > 0) {
    await supabase.from('items_gasto').insert(
      params.items.map((item) => ({
        gasto_id: gasto.id,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        unidad: item.unidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
        categoria: item.categoria,
        etiquetas: item.etiquetas,
        confianza_ia: item.confianza_ia,
        etapa_id: item.etapa_id || null,
        partida_id: item.partida_id || null,
        estado: item.estado,
      }))
    )
  }

  return gasto.id
}

export async function deleteGasto(id: string): Promise<boolean> {
  const supabase = createClient()
  const { error: errorItems } = await supabase.from('items_gasto').delete().eq('gasto_id', id)
  if (errorItems) {
    console.error('deleteGasto (items):', errorItems)
    return false
  }
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) {
    console.error('deleteGasto:', error)
    return false
  }
  return true
}

export async function deleteItemGasto(id: string, comentario?: string): Promise<{ ok: boolean; nuevoTotal: number } | null> {
  const supabase = createClient()
  const { data: itemActual } = await supabase
    .from('items_gasto')
    .select('gasto_id, subtotal, descripcion')
    .eq('id', id)
    .single()
  if (!itemActual) return null

  const { error } = await supabase.from('items_gasto').delete().eq('id', id)
  if (error) {
    console.error('deleteItemGasto:', error)
    return null
  }

  await logItemEvento({
    gasto_id: itemActual.gasto_id,
    item_id: null,
    descripcion_item: itemActual.descripcion,
    accion: 'eliminado',
    subtotal_anterior: itemActual.subtotal,
    subtotal_nuevo: null,
    comentario,
  })
  const nuevoTotal = await recalcularTotalGasto(itemActual.gasto_id)
  return { ok: true, nuevoTotal }
}

// ---- Aprendizaje de clasificación ----

export async function getClasificacionesAprendidas(proyecto_id: string): Promise<ClasificacionAprendida[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('clasificaciones_aprendidas')
    .select('*')
    .eq('proyecto_id', proyecto_id)
  return (data ?? []) as ClasificacionAprendida[]
}

export async function upsertClasificacionAprendida(params: {
  proyecto_id: string
  descripcion: string
  categoria: string
  etiquetas: string[]
}): Promise<void> {
  const supabase = createClient()
  const descripcion_normalizada = normalizarDescripcion(params.descripcion)

  const { data: existente } = await supabase
    .from('clasificaciones_aprendidas')
    .select('id, veces_confirmado')
    .eq('proyecto_id', params.proyecto_id)
    .eq('descripcion_normalizada', descripcion_normalizada)
    .maybeSingle()

  await supabase.from('clasificaciones_aprendidas').upsert(
    {
      proyecto_id: params.proyecto_id,
      descripcion_normalizada,
      categoria: params.categoria,
      etiquetas: params.etiquetas,
      veces_confirmado: (existente?.veces_confirmado ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'proyecto_id,descripcion_normalizada' }
  )
}
