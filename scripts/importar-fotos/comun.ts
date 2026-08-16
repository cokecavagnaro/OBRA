// Helpers compartidos entre extraer.ts e inyectar.ts. No reusa
// scripts/qa/env.js (lee .env.test.local, pensado para QA) — un import de
// datos reales de cliente no debe depender de un archivo con esa semántica.
// Carga .env.local a mano, mismo patrón que scripts/migrar-imagenes-storage.js.

import fs from 'fs'
import path from 'path'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const envPath = path.join(__dirname, '..', '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta ${name} en .env.local`)
  return value
}

export function createAdminClient(): SupabaseClient {
  return createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
}

export interface AdminResuelto {
  id: string
  cuenta_id: string
  rol: string
}

export async function resolverAdmin(supabase: SupabaseClient, email: string): Promise<AdminResuelto> {
  const { data, error } = await supabase.from('usuarios').select('id, cuenta_id, rol').eq('email', email).single()
  if (error || !data) throw new Error(`No se encontró el usuario ${email}: ${error?.message}`)
  if (data.rol === 'usuario') {
    throw new Error(`El usuario ${email} tiene rol 'usuario' — las boletas no se podrían marcar 'aprobado' a su nombre. Se esperaba 'admin' o 'super_admin'.`)
  }
  return data as AdminResuelto
}

export async function obtenerOCrearProyecto(supabase: SupabaseClient, cuentaId: string, userId: string, nombre: string): Promise<string> {
  const { data: existente } = await supabase
    .from('proyectos')
    .select('id')
    .eq('nombre', nombre)
    .eq('cuenta_id', cuentaId)
    .maybeSingle()
  if (existente) return existente.id

  const { data: creado, error } = await supabase
    .from('proyectos')
    .insert({ nombre, system_prompt: '', user_id: userId, cuenta_id: cuentaId, presupuesto: null })
    .select('id')
    .single()
  if (error || !creado) throw new Error(`No se pudo crear el proyecto "${nombre}": ${error?.message}`)
  console.log(`Proyecto creado: ${nombre} (${creado.id})`)
  return creado.id
}

const FIRMAS: Array<{ mediaType: string; ext: string; test: (b: Buffer) => boolean }> = [
  { mediaType: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mediaType: 'image/png', ext: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mediaType: 'image/gif', ext: 'gif', test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 },
  { mediaType: 'image/webp', ext: 'webp', test: (b) => b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP' },
  { mediaType: 'application/pdf', ext: 'pdf', test: (b) => b.slice(0, 4).toString('ascii') === '%PDF' },
]

export function detectarMediaType(buffer: Buffer): { mediaType: string; ext: string } | null {
  const firma = FIRMAS.find((f) => f.test(buffer))
  return firma ? { mediaType: firma.mediaType, ext: firma.ext } : null
}

const EXTENSIONES_CONOCIDAS = /\.(jpe?g|png|gif|webp|pdf|heic|heif)$/i

export function listarArchivos(carpeta: string): string[] {
  return fs
    .readdirSync(carpeta)
    .filter((f) => EXTENSIONES_CONOCIDAS.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

export function parsearArgs(argv: string[]): { flags: Record<string, string>; posicionales: string[] } {
  const flags: Record<string, string> = {}
  const posicionales: string[] = []
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [clave, valor] = arg.slice(2).split('=')
      flags[clave] = valor ?? 'true'
    } else {
      posicionales.push(arg)
    }
  }
  return { flags, posicionales }
}

// Reimplementación con cliente admin de lib/supabase/db.ts::upsertClasificacionAprendida
// — CRUD puro sin lógica de negocio, se duplica a mano a propósito en vez de
// extraerlo (no hay prompt ni reglas que se puedan desincronizar).
export async function upsertClasificacionAprendidaAdmin(
  supabase: SupabaseClient,
  proyectoId: string,
  descripcionNormalizada: string,
  categoria: string,
  etiquetas: string[],
  vecesConfirmadoActual: number
): Promise<void> {
  await supabase.from('clasificaciones_aprendidas').upsert(
    {
      proyecto_id: proyectoId,
      descripcion_normalizada: descripcionNormalizada,
      categoria,
      etiquetas,
      veces_confirmado: vecesConfirmadoActual + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'proyecto_id,descripcion_normalizada' }
  )
}
