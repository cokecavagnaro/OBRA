import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import type { PermisoKey } from '@/lib/permisos'

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
  if (!usuarioActual || !['admin', 'super_admin'].includes(usuarioActual.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { email, rol, overrides } = (await request.json()) as {
    email: string
    rol: 'admin' | 'usuario'
    overrides?: { permission_key: PermisoKey; granted: boolean }[]
  }
  if (!email || !rol) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: invitacion, error: invError } = await admin
    .from('invitaciones')
    .insert({ cuenta_id: usuarioActual.cuenta_id, email, rol, invitado_por: user.id })
    .select('id')
    .single()
  if (invError || !invitacion) {
    return NextResponse.json({ error: invError?.message ?? 'No se pudo crear la invitación' }, { status: 500 })
  }

  if (overrides && overrides.length > 0) {
    const { error: overridesError } = await admin
      .from('invitacion_permission_overrides')
      .insert(overrides.map((o) => ({ invitacion_id: invitacion.id, permission_key: o.permission_key, granted: o.granted })))
    if (overridesError) console.error('invitar-usuario (overrides):', overridesError)
  }

  // No usamos inviteUserByEmail porque dispara el email automático de Supabase con
  // la plantilla por defecto, que no se puede editar sin SMTP propio configurado.
  // generateLink no manda ningún email — devolvemos el link para que el admin lo
  // copie y se lo mande él mismo a la persona invitada por el medio que prefiera.
  const origin = new URL(request.url).origin
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${origin}/auth/callback` },
  })
  if (linkError || !linkData) {
    console.error('invitar-usuario (link):', linkError)
    return NextResponse.json({ error: linkError?.message ?? 'No se pudo generar el link' }, { status: 500 })
  }

  const link = `${origin}/auth/callback?token_hash=${linkData.properties.hashed_token}&type=invite`
  return NextResponse.json({ ok: true, link })
}
