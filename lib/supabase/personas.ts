import { createClient } from './client'
import type { Persona } from '../types'

export async function listarPersonas(cuentaId: string, incluirInactivas = false): Promise<Persona[]> {
  const supabase = createClient()
  let query = supabase.from('personas').select('*').eq('cuenta_id', cuentaId).order('nombre')
  if (!incluirInactivas) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) console.error('listarPersonas:', error)
  return (data ?? []) as Persona[]
}

export async function crearPersona(cuentaId: string, nombre: string, rut?: string | null): Promise<Persona | null> {
  const supabase = createClient()
  const nombreLimpio = nombre.trim()
  if (!nombreLimpio) return null

  const { data, error } = await supabase
    .from('personas')
    .insert({ cuenta_id: cuentaId, nombre: nombreLimpio, rut: rut?.trim() || null })
    .select()
    .single()

  if (error || !data) {
    console.error('crearPersona:', error)
    return null
  }
  return data as Persona
}

export async function desactivarPersona(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('personas').update({ activo: false }).eq('id', id)
}
