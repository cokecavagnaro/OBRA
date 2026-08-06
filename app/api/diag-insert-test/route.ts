import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const res = await admin
      .from('invitaciones')
      .insert({
        cuenta_id: 'b0a70cb1-718c-46d1-8d97-2735e7c46f01',
        email: 'diag-build-local@example.com',
        rol: 'usuario',
        invitado_por: 'c46bdfb3-915f-40f6-a20c-f03467d46dc8',
      })
      .select('id')
      .single()

    if (res.data?.id) {
      await admin.from('invitaciones').delete().eq('id', res.data.id)
    }

    return NextResponse.json({ data: res.data, error: res.error })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack : undefined
    return NextResponse.json({ thrown: true, error: msg, stack })
  }
}
