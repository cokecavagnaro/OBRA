import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { formatCLP } from '@/lib/mock'

// Notifica al solicitante que su boleta fue aprobada/rechazada. Corre
// server-side con service role porque la notificación va dirigida a OTRA
// persona (el solicitante) — la RLS de `notificaciones` exige
// `usuario_id = auth.uid()` en el insert (migración 019), así que un cliente
// autenticado normal ya no puede crear avisos para terceros directamente.
//
// El `tipo` y el mensaje se derivan del estado actual del gasto en la base
// (no de lo que mande el cliente) y se exige que quien llama sea realmente
// quien resolvió esa boleta (`aprobado_por_id === auth.uid()`) — así ningún
// usuario puede generar notificaciones falsas de "aprobado"/"rechazado"
// para boletas que no resolvió.
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* no-op: esta ruta no necesita refrescar la sesión */ },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { gasto_id } = (await request.json()) as { gasto_id: string }
  if (!gasto_id) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: gasto } = await admin
    .from('gastos')
    .select('proyecto_id, proveedor, total, solicitante_id, aprobado_por_id, estado_aprobacion')
    .eq('id', gasto_id)
    .single()

  if (!gasto || gasto.aprobado_por_id !== user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (!gasto.solicitante_id) return NextResponse.json({ ok: true, notificado: false })

  const tipo = gasto.estado_aprobacion === 'aprobado' ? 'boleta_aprobada' : 'boleta_rechazada'
  const mensaje = tipo === 'boleta_aprobada'
    ? `Tu boleta de ${gasto.proveedor} (${formatCLP(gasto.total)}) fue aprobada`
    : `Tu boleta de ${gasto.proveedor} (${formatCLP(gasto.total)}) fue rechazada`

  const { data: proyecto } = await admin.from('proyectos').select('cuenta_id').eq('id', gasto.proyecto_id).single()
  if (!proyecto?.cuenta_id) return NextResponse.json({ ok: true, notificado: false })

  const { error } = await admin.from('notificaciones').insert({
    usuario_id: gasto.solicitante_id,
    cuenta_id: proyecto.cuenta_id,
    tipo,
    gasto_id: null,
    mensaje,
  })
  if (error) {
    console.error('notificar-solicitante:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, notificado: true })
}
