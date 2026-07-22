import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { tienePermiso } from '@/lib/permisos'
import { formatCLP } from '@/lib/mock'
import type { Usuario, PermissionOverride } from '@/lib/types'

// Resuelve quiénes pueden aprobar boletas y les crea la notificación. Corre
// server-side con service role porque un usuario común no puede leer las
// filas de OTROS usuarios de su cuenta bajo RLS (migración 006: eso está
// reservado a admin/super_admin) — necesario para poder avisarle a los
// aprobadores aunque quien solicita no sea uno de ellos.
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

  const { data: usuarioActual } = await supabase.from('usuarios').select('*').eq('id', user.id).single()
  if (!usuarioActual) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })
  }

  const { gasto_id, proveedor, total } = (await request.json()) as {
    gasto_id: string
    proveedor: string
    total: number
  }
  if (!gasto_id || !proveedor || typeof total !== 'number') {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: usuariosData, error: usuariosError } = await admin
    .from('usuarios')
    .select('*')
    .eq('cuenta_id', usuarioActual.cuenta_id)
    .eq('activo', true)
  if (usuariosError) console.error('solicitar-aprobacion (usuarios):', usuariosError)
  const usuarios = (usuariosData ?? []) as Usuario[]
  if (usuarios.length === 0) return NextResponse.json({ ok: true, notificados: 0 })

  const { data: overridesData, error: overridesError } = await admin
    .from('user_permission_overrides')
    .select('*')
    .eq('permission_key', 'approve_boletas')
    .in('user_id', usuarios.map((u) => u.id))
  if (overridesError) console.error('solicitar-aprobacion (overrides):', overridesError)
  const overrides = (overridesData ?? []) as PermissionOverride[]

  const aprobadores = usuarios.filter((u) =>
    tienePermiso(u, overrides.filter((o) => o.user_id === u.id), 'approve_boletas')
  )
  if (aprobadores.length === 0) return NextResponse.json({ ok: true, notificados: 0 })

  const { error } = await admin.from('notificaciones').insert(
    aprobadores.map((a) => ({
      usuario_id: a.id,
      cuenta_id: usuarioActual.cuenta_id,
      tipo: 'solicitud_aprobacion',
      gasto_id,
      mensaje: `${proveedor} (${formatCLP(total)}) espera tu aprobación`,
    }))
  )
  if (error) {
    console.error('solicitar-aprobacion:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, notificados: aprobadores.length })
}
