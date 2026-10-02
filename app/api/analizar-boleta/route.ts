import { NextRequest, NextResponse } from 'next/server'
import { analizarBoletaImagen } from '@/lib/analizarBoleta'
import { clasificarDocumento } from '@/lib/clasificarDocumento'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import type { ClasificacionAprendida } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const { imagen_base64, media_type, proyecto_id, contexto_boleta, solo_gasto } = await req.json()

    if (!imagen_base64 || !proyecto_id) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // Antes de leer ítems, se decide si el documento es un comprobante de
    // transferencia que entra al proyecto (ingreso). El re-escaneo de una
    // boleta existente salta este paso: ya se sabe que es un gasto. Si la
    // clasificación falla, se sigue como boleta — el flujo de siempre.
    if (!solo_gasto) {
      try {
        const clasificacion = await clasificarDocumento(imagen_base64, media_type || 'image/jpeg')
        if (clasificacion.tipo === 'ingreso') return NextResponse.json(clasificacion)
      } catch (err) {
        console.error('[analizar-boleta] clasificación falló, se sigue como boleta', err)
      }
    }

    const supabase = await createServerSupabaseClient()
    const { data } = await supabase
      .from('clasificaciones_aprendidas')
      .select('*')
      .eq('proyecto_id', proyecto_id)
    const aprendidas = (data ?? []) as ClasificacionAprendida[]

    const resultado = await analizarBoletaImagen(imagen_base64, media_type || 'image/jpeg', aprendidas, contexto_boleta)

    return NextResponse.json({ ...resultado, tipo: 'gasto' })
  } catch (err) {
    console.error('[analizar-boleta]', err)
    return NextResponse.json({ error: 'Error al analizar la boleta' }, { status: 500 })
  }
}
