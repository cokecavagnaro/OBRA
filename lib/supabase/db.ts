import { createClient } from './client'
import { normalizarDescripcion } from '../aprendizaje'
import { determinarInterpretacionConIva, calcularNetoBruto, type InterpretacionPrecio, type FuenteInterpretacion } from '../confianzaDocumento'
import type { Proyecto, Etapa, Partida, Gasto, ClasificacionAprendida, Usuario, Invitacion, PermissionOverride, Cuenta, EstadoItem, RolUsuario, GastoEvento, Notificacion } from '../types'
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
  // gasto_eventos tiene fk con cascade en proyecto_id (a diferencia de
  // item_gasto_eventos/items_gasto/gastos, ver comentario arriba), pero se
  // limpia igual acá por consistencia con la paranoia ya documentada.
  await supabase.from('gasto_eventos').delete().eq('proyecto_id', proyecto.id)

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

// gasto_eventos.gasto_id no tiene fk a propósito (ver migración 017: el
// evento 'eliminada' debe sobrevivir al borrado de su propia boleta), así
// que PostgREST no puede embeberla automáticamente vía gasto_eventos(*) —
// se trae en una query aparte y se agrupa acá.
function agruparEventosPorGasto(eventos: GastoEvento[]): Map<string, GastoEvento[]> {
  const mapa = new Map<string, GastoEvento[]>()
  for (const ev of eventos) {
    if (!ev.gasto_id) continue
    const lista = mapa.get(ev.gasto_id) ?? []
    lista.push(ev)
    mapa.set(ev.gasto_id, lista)
  }
  return mapa
}

function mapGastoRow(g: Record<string, unknown>, historialAprobacion: GastoEvento[] = []): Gasto {
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
    historial_aprobacion: historialAprobacion.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)),
  } as unknown as Gasto
}

export async function getGastos(proyecto_id: string): Promise<Gasto[]> {
  const supabase = createClient()
  const [{ data, error }, { data: eventosData }] = await Promise.all([
    supabase
      .from('gastos')
      .select('*, items_gasto(*), item_gasto_eventos(*)')
      .eq('proyecto_id', proyecto_id)
      .order('created_at', { ascending: false }),
    supabase.from('gasto_eventos').select('*').eq('proyecto_id', proyecto_id),
  ])

  if (error) console.error('getGastos:', error)
  if (!data) return []
  const eventosPorGasto = agruparEventosPorGasto((eventosData ?? []) as GastoEvento[])
  return data.map((g) => mapGastoRow(g, eventosPorGasto.get(g.id as string) ?? []))
}

export async function getAllGastos(): Promise<Gasto[]> {
  const supabase = createClient()
  const [{ data }, { data: eventosData }] = await Promise.all([
    supabase
      .from('gastos')
      .select('*, items_gasto(*), item_gasto_eventos(*)')
      .order('created_at', { ascending: false }),
    supabase.from('gasto_eventos').select('*'),
  ])

  if (!data) return []
  const eventosPorGasto = agruparEventosPorGasto((eventosData ?? []) as GastoEvento[])
  return data.map((g) => mapGastoRow(g, eventosPorGasto.get(g.id as string) ?? []))
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
    // con la jerarquía de señales (sin iva_impreso disponible acá, cae al
    // cuadre contra el total o al default bruto) y queda guardada para la próxima.
    const sumaExtraida = itemsList.reduce((s, i) => s + i.subtotal, 0)
    interpretacion = determinarInterpretacionConIva(sumaExtraida, gasto?.total ?? 0, null).interpretacion
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

// crypto.randomUUID() solo existe en contextos seguros (HTTPS o localhost) —
// en producción (Vercel, siempre HTTPS) nunca falta, pero al probar por IP
// local sin HTTPS (ej. desde el celular contra el servidor de desarrollo)
// el navegador lo deshabilita y esto rompe la subida de la imagen.
function generarUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function subirImagenBoleta(cuentaId: string, proyectoId: string, blob: Blob): Promise<string | null> {
  const supabase = createClient()
  const path = `${cuentaId}/${proyectoId}/${generarUUID()}.jpg`
  const { error } = await supabase.storage.from('boletas').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) {
    console.error('subirImagenBoleta:', error)
    return null
  }
  const { data } = supabase.storage.from('boletas').getPublicUrl(path)
  return data.publicUrl
}

// ---- Flujo de aprobación de boletas ----

async function logGastoEvento(params: {
  gasto_id: string | null
  proyecto_id: string
  gasto_proveedor: string
  gasto_total: number
  accion: GastoEvento['accion']
  estado_anterior?: string | null
  estado_nuevo?: string | null
  comentario?: string | null
}): Promise<void> {
  const supabase = createClient()
  const usuarioActual = await getUsuarioActual()
  await supabase.from('gasto_eventos').insert({
    gasto_id: params.gasto_id,
    proyecto_id: params.proyecto_id,
    gasto_proveedor: params.gasto_proveedor,
    gasto_total: params.gasto_total,
    accion: params.accion,
    estado_anterior: params.estado_anterior ?? null,
    estado_nuevo: params.estado_nuevo ?? null,
    comentario: params.comentario ?? null,
    usuario_id: usuarioActual?.id ?? null,
    usuario_email: usuarioActual?.email ?? '',
  })
}

// Delega a una API route con service role: un solicitante común no puede
// leer las filas de OTROS usuarios de su cuenta bajo RLS (migración 006,
// reservado a admin/super_admin), así que resolver "quién puede aprobar" y
// notificarlo no se puede hacer con el cliente autenticado normal.
async function notificarAprobadores(gastoId: string, proveedor: string, total: number): Promise<void> {
  try {
    await fetch('/api/solicitar-aprobacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasto_id: gastoId, proveedor, total }),
    })
  } catch (err) {
    console.error('notificarAprobadores:', err)
  }
}

// Notifica al solicitante que su boleta fue resuelta. Delega a una API route
// server-side (igual que notificarAprobadores): la RLS de `notificaciones`
// exige `usuario_id = auth.uid()` en el insert (migración 019), así que un
// cliente autenticado normal no puede crear un aviso dirigido a otra
// persona — el tipo/mensaje se derivan server-side del estado real del
// gasto, no de lo que mande este cliente.
async function notificarSolicitante(gastoId: string): Promise<void> {
  try {
    await fetch('/api/notificar-solicitante', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gasto_id: gastoId }),
    })
  } catch (err) {
    console.error('notificarSolicitante:', err)
  }
}

// Solo uno de varios aprobadores puede resolver una boleta: el guard
// .eq('estado_aprobacion', 'pendiente') hace que, si dos aprobadores actúan
// casi al mismo tiempo, el segundo update no afecte ninguna fila.
export async function aprobarBoleta(gastoId: string): Promise<{ ok: boolean; yaResuelta?: boolean }> {
  const supabase = createClient()
  const usuarioActual = await getUsuarioActual()
  if (!usuarioActual) return { ok: false }

  const { data, error } = await supabase
    .from('gastos')
    .update({
      estado_aprobacion: 'aprobado',
      aprobado_por_id: usuarioActual.id,
      aprobado_por_email: usuarioActual.email,
      fecha_resolucion: new Date().toISOString(),
      motivo_rechazo: null,
    })
    .eq('id', gastoId)
    .eq('estado_aprobacion', 'pendiente')
    .select('id, proyecto_id, proveedor, total, solicitante_id')
    .maybeSingle()

  if (error) {
    console.error('aprobarBoleta:', error)
    return { ok: false }
  }
  if (!data) return { ok: false, yaResuelta: true }

  await logGastoEvento({
    gasto_id: data.id,
    proyecto_id: data.proyecto_id,
    gasto_proveedor: data.proveedor,
    gasto_total: data.total,
    accion: 'aprobada',
    estado_anterior: 'pendiente',
    estado_nuevo: 'aprobado',
  })
  await notificarSolicitante(data.id)
  return { ok: true }
}

export async function rechazarBoleta(gastoId: string, motivo: string): Promise<{ ok: boolean; yaResuelta?: boolean }> {
  const supabase = createClient()
  const usuarioActual = await getUsuarioActual()
  if (!usuarioActual || !motivo.trim()) return { ok: false }

  const { data, error } = await supabase
    .from('gastos')
    .update({
      estado_aprobacion: 'rechazado',
      aprobado_por_id: usuarioActual.id,
      aprobado_por_email: usuarioActual.email,
      fecha_resolucion: new Date().toISOString(),
      motivo_rechazo: motivo.trim(),
    })
    .eq('id', gastoId)
    .eq('estado_aprobacion', 'pendiente')
    .select('id, proyecto_id, proveedor, total, solicitante_id')
    .maybeSingle()

  if (error) {
    console.error('rechazarBoleta:', error)
    return { ok: false }
  }
  if (!data) return { ok: false, yaResuelta: true }

  await logGastoEvento({
    gasto_id: data.id,
    proyecto_id: data.proyecto_id,
    gasto_proveedor: data.proveedor,
    gasto_total: data.total,
    accion: 'rechazada',
    estado_anterior: 'pendiente',
    estado_nuevo: 'rechazado',
    comentario: motivo.trim(),
  })
  await notificarSolicitante(data.id)
  return { ok: true }
}

// Solo el dueño de la boleta reenvía la suya (chequeado en la UI); el guard
// .eq('estado_aprobacion', 'rechazado') evita reenviar una que ya no lo está.
export async function reenviarBoleta(gastoId: string, comentario?: string): Promise<{ ok: boolean }> {
  const supabase = createClient()
  const usuarioActual = await getUsuarioActual()
  if (!usuarioActual) return { ok: false }

  const { data, error } = await supabase
    .from('gastos')
    .update({
      estado_aprobacion: 'pendiente',
      fecha_solicitud: new Date().toISOString(),
      fecha_resolucion: null,
      motivo_rechazo: null,
      aprobado_por_id: null,
      aprobado_por_email: null,
    })
    .eq('id', gastoId)
    .eq('estado_aprobacion', 'rechazado')
    .select('id, proyecto_id, proveedor, total')
    .maybeSingle()

  if (error || !data) {
    console.error('reenviarBoleta:', error)
    return { ok: false }
  }

  await logGastoEvento({
    gasto_id: data.id,
    proyecto_id: data.proyecto_id,
    gasto_proveedor: data.proveedor,
    gasto_total: data.total,
    accion: 'reenviada',
    estado_anterior: 'rechazado',
    estado_nuevo: 'pendiente',
    comentario,
  })

  await notificarAprobadores(data.id, data.proveedor, data.total)
  return { ok: true }
}

// Editor de campos de la boleta (no de ítems) — usado tanto por el aprobador
// (antes de aprobar) como por el dueño (antes de reenviar tras un rechazo).
export async function updateGastoDatos(
  gastoId: string,
  cambios: { proveedor?: string; rut_proveedor?: string; fecha_boleta?: string },
  comentario?: string
): Promise<{ ok: boolean }> {
  const supabase = createClient()
  const { data: gastoActual } = await supabase.from('gastos').select('proyecto_id, proveedor, total').eq('id', gastoId).single()
  if (!gastoActual) return { ok: false }

  const { error } = await supabase.from('gastos').update(cambios).eq('id', gastoId)
  if (error) {
    console.error('updateGastoDatos:', error)
    return { ok: false }
  }

  await logGastoEvento({
    gasto_id: gastoId,
    proyecto_id: gastoActual.proyecto_id,
    gasto_proveedor: cambios.proveedor ?? gastoActual.proveedor,
    gasto_total: gastoActual.total,
    accion: 'editada',
    comentario,
  })
  return { ok: true }
}

// ---- Notificaciones ----

export async function getNotificaciones(usuarioId: string): Promise<Notificacion[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
  return (data ?? []) as Notificacion[]
}

export async function marcarNotificacionLeida(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('notificaciones').update({ leida: true }).eq('id', id)
}

export async function marcarTodasNotificacionesLeidas(usuarioId: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('notificaciones').update({ leida: true }).eq('usuario_id', usuarioId).eq('leida', false)
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
  iva_impreso?: number | null
  fuente_interpretacion?: FuenteInterpretacion | null
  descuento_general_monto?: number | null
  descuento_general_descripcion?: string | null
  solicitante_id: string
  solicitante_rol: RolUsuario
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
  // Sin iva_impreso/texto IA disponibles acá (defensivo: en la práctica
  // route.ts siempre manda interpretacion_precios ya decidida) — cae directo
  // a cuadre-contra-total o default bruto, nunca "adivina" neto.
  const interpretacion = params.interpretacion_precios ?? determinarInterpretacionConIva(sumaItems, totalValido, null).interpretacion

  // Solo un usuario sin rol admin/super_admin pasa por el flujo de
  // aprobación — nunca hay autoaprobación para 'usuario'.
  const requiereAprobacion = params.solicitante_rol === 'usuario'
  const ahora = new Date().toISOString()

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
      iva_impreso: params.iva_impreso ?? null,
      fuente_interpretacion: params.fuente_interpretacion ?? null,
      descuento_general_monto: params.descuento_general_monto || null,
      descuento_general_descripcion: params.descuento_general_descripcion || null,
      estado,
      estado_aprobacion: requiereAprobacion ? 'pendiente' : 'aprobado',
      solicitante_id: params.solicitante_id,
      fecha_solicitud: requiereAprobacion ? ahora : null,
    })
    .select()
    .single()

  if (error || !gasto) {
    console.error('Error saving gasto:', error)
    return null
  }

  if (requiereAprobacion) {
    await logGastoEvento({
      gasto_id: gasto.id,
      proyecto_id: params.proyecto_id,
      gasto_proveedor: gasto.proveedor,
      gasto_total: gasto.total,
      accion: 'solicitada',
      estado_nuevo: 'pendiente',
    })
    await notificarAprobadores(gasto.id, gasto.proveedor, gasto.total)
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
  const { data: gastoActual } = await supabase
    .from('gastos')
    .select('proyecto_id, proveedor, total, estado_aprobacion')
    .eq('id', id)
    .single()

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

  if (gastoActual) {
    await logGastoEvento({
      gasto_id: id,
      proyecto_id: gastoActual.proyecto_id,
      gasto_proveedor: gastoActual.proveedor,
      gasto_total: gastoActual.total,
      accion: 'eliminada',
      estado_anterior: gastoActual.estado_aprobacion,
    })
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
