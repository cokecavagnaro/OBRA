import { createClient } from './client'
import { normalizarDescripcion } from '../aprendizaje'
import type { Obra, Etapa, Partida, Gasto, ClasificacionAprendida, Usuario, Invitacion, PermissionOverride, Cuenta } from '../types'
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
): Promise<boolean> {
  // Se manda al servidor (no se llama a Supabase directo desde el navegador) porque
  // invitar a otra persona necesita la Admin API de Supabase, que requiere la
  // service role key (secreta) y no puede vivir en el cliente.
  const res = await fetch('/api/invitar-usuario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, rol, overrides }),
  })
  if (!res.ok) {
    console.error('crearInvitacion:', await res.text())
    return false
  }
  return true
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

// ---- Obras ----

export async function getObras(): Promise<Obra[]> {
  const supabase = createClient()
  const { data } = await supabase.from('obras').select('*').order('created_at')
  return (data ?? []) as Obra[]
}

export async function createObra(nombre: string, system_prompt = ''): Promise<Obra | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const usuarioActual = await getUsuarioActual()
  const { data, error } = await supabase
    .from('obras')
    .insert({ nombre, system_prompt, user_id: user.id, cuenta_id: usuarioActual?.cuenta_id })
    .select()
    .single()
  if (error) console.error('createObra:', error)
  return data as Obra | null
}

export async function updateObraPrompt(id: string, system_prompt: string) {
  const supabase = createClient()
  await supabase.from('obras').update({ system_prompt }).eq('id', id)
}

// ---- Etapas ----

export async function getEtapas(obra_id: string): Promise<Etapa[]> {
  const supabase = createClient()
  const { data } = await supabase.from('etapas').select('*').eq('obra_id', obra_id).order('orden')
  return (data ?? []) as Etapa[]
}

export async function createEtapa(obra_id: string, nombre: string, orden: number): Promise<Etapa | null> {
  const supabase = createClient()
  const { data } = await supabase.from('etapas').insert({ obra_id, nombre, orden }).select().single()
  return data as Etapa | null
}

// ---- Partidas ----

export async function getPartidas(obra_id: string): Promise<Partida[]> {
  const supabase = createClient()
  const { data } = await supabase.from('partidas').select('*').eq('obra_id', obra_id).order('created_at')
  return (data ?? []) as Partida[]
}

export async function createPartida(obra_id: string, nombre: string, etapa_id?: string): Promise<Partida | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('partidas')
    .insert({ obra_id, nombre, etapa_id: etapa_id || null })
    .select()
    .single()
  return data as Partida | null
}

// ---- Gastos ----

export async function getGastos(obra_id: string): Promise<Gasto[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('gastos')
    .select('*, items_gasto(*)')
    .eq('obra_id', obra_id)
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((g: Record<string, unknown>) => ({
    ...g,
    etapa_id: '',
    partida_id: '',
    moneda: (g.moneda as string) ?? 'CLP',
    created_by: 'usuario',
    items: ((g.items_gasto as Record<string, unknown>[]) ?? []).map((i) => ({
      ...i,
      etapa_id: (i.etapa_id as string) ?? '',
      partida_id: (i.partida_id as string) ?? '',
      confianza_ia: (i.confianza_ia as number) ?? 0,
      etiquetas: (i.etiquetas as string[]) ?? [],
    })),
  })) as Gasto[]
}

export async function getAllGastos(): Promise<Gasto[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('gastos')
    .select('*, items_gasto(*)')
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((g: Record<string, unknown>) => ({
    ...g,
    etapa_id: '',
    partida_id: '',
    moneda: (g.moneda as string) ?? 'CLP',
    created_by: 'usuario',
    items: ((g.items_gasto as Record<string, unknown>[]) ?? []).map((i) => ({
      ...i,
      etapa_id: (i.etapa_id as string) ?? '',
      partida_id: (i.partida_id as string) ?? '',
      confianza_ia: (i.confianza_ia as number) ?? 0,
      etiquetas: (i.etiquetas as string[]) ?? [],
    })),
  })) as Gasto[]
}

export async function updateItemGasto(id: string, params: {
  etapa_id?: string | null
  partida_id?: string | null
  etiquetas?: string[]
  cantidad?: number
  precio_unitario?: number
  subtotal?: number
}): Promise<boolean> {
  const supabase = createClient()
  const update: Record<string, unknown> = {
    etapa_id: params.etapa_id ?? null,
    partida_id: params.partida_id ?? null,
    etiquetas: params.etiquetas ?? [],
  }
  if (params.cantidad !== undefined) update.cantidad = params.cantidad
  if (params.precio_unitario !== undefined) update.precio_unitario = params.precio_unitario
  if (params.subtotal !== undefined) update.subtotal = params.subtotal

  const { error } = await supabase
    .from('items_gasto')
    .update(update)
    .eq('id', id)
  if (error) console.error('updateItemGasto:', error)
  return !error
}

export async function saveGasto(params: {
  obra_id: string
  proveedor: string
  rut_proveedor: string
  fecha_boleta: string
  total: number
  imagen_url: string
  contexto_boleta: string
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

  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert({
      obra_id: params.obra_id,
      proveedor: params.proveedor || 'Sin proveedor',
      rut_proveedor: params.rut_proveedor || '',
      fecha_boleta: fechaValida,
      total: totalValido,
      imagen_url: params.imagen_url,
      contexto_boleta: params.contexto_boleta,
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

// ---- Aprendizaje de clasificación ----

export async function getClasificacionesAprendidas(obra_id: string): Promise<ClasificacionAprendida[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('clasificaciones_aprendidas')
    .select('*')
    .eq('obra_id', obra_id)
  return (data ?? []) as ClasificacionAprendida[]
}

export async function upsertClasificacionAprendida(params: {
  obra_id: string
  descripcion: string
  categoria: string
  etiquetas: string[]
}): Promise<void> {
  const supabase = createClient()
  const descripcion_normalizada = normalizarDescripcion(params.descripcion)

  const { data: existente } = await supabase
    .from('clasificaciones_aprendidas')
    .select('id, veces_confirmado')
    .eq('obra_id', params.obra_id)
    .eq('descripcion_normalizada', descripcion_normalizada)
    .maybeSingle()

  await supabase.from('clasificaciones_aprendidas').upsert(
    {
      obra_id: params.obra_id,
      descripcion_normalizada,
      categoria: params.categoria,
      etiquetas: params.etiquetas,
      veces_confirmado: (existente?.veces_confirmado ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'obra_id,descripcion_normalizada' }
  )
}
