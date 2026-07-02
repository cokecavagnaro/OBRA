import { createClient } from './client'
import type { Obra, Etapa, Partida, Gasto } from '../types'

// ---- Obras ----

export async function getObras(): Promise<Obra[]> {
  const supabase = createClient()
  const { data } = await supabase.from('obras').select('*').order('created_at')
  return (data ?? []) as Obra[]
}

export async function createObra(nombre: string, system_prompt = ''): Promise<Obra | null> {
  const supabase = createClient()
  const { data } = await supabase.from('obras').insert({ nombre, system_prompt }).select().single()
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

  return data.map((g: any) => ({
    ...g,
    etapa_id: '',
    partida_id: '',
    moneda: g.moneda ?? 'CLP',
    created_by: 'usuario',
    items: (g.items_gasto ?? []).map((i: any) => ({
      ...i,
      etapa_id: i.etapa_id ?? '',
      partida_id: i.partida_id ?? '',
      confianza_ia: i.confianza_ia ?? 0,
      etiquetas: i.etiquetas ?? [],
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

  return data.map((g: any) => ({
    ...g,
    etapa_id: '',
    partida_id: '',
    moneda: g.moneda ?? 'CLP',
    created_by: 'usuario',
    items: (g.items_gasto ?? []).map((i: any) => ({
      ...i,
      etapa_id: i.etapa_id ?? '',
      partida_id: i.partida_id ?? '',
      confianza_ia: i.confianza_ia ?? 0,
      etiquetas: i.etiquetas ?? [],
    })),
  })) as Gasto[]
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
  const fecha = params.fecha_boleta || new Date().toISOString().split('T')[0]

  const { data: gasto, error } = await supabase
    .from('gastos')
    .insert({
      obra_id: params.obra_id,
      proveedor: params.proveedor,
      rut_proveedor: params.rut_proveedor,
      fecha_boleta: fecha,
      total: params.total,
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
