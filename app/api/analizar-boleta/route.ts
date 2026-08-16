import { NextRequest, NextResponse } from 'next/server'
import { analizarBoletaImagen } from '@/lib/analizarBoleta'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import type { ClasificacionAprendida } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const { imagen_base64, media_type, proyecto_id, contexto_boleta } = await req.json()

    if (!imagen_base64 || !proyecto_id) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('clasificaciones_aprendidas')
      .select('*')
      .eq('proyecto_id', proyecto_id)
    const aprendidas = (data ?? []) as ClasificacionAprendida[]

    const resultado = await analizarBoletaImagen(imagen_base64, media_type || 'image/jpeg', aprendidas, contexto_boleta)

    return NextResponse.json(resultado)
  } catch (err) {
    console.error('[analizar-boleta]', err)
    return NextResponse.json({ error: 'Error al analizar la boleta' }, { status: 500 })
  }
}
