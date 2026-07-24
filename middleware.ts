import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Rutas públicas que no requieren auth
  const isPublic = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth')

  // Las rutas /api/* manejan su propio chequeo de auth y devuelven un 401 en
  // JSON (ver app/api/solicitar-aprobacion, notificar-solicitante, etc.) —
  // antes, si la sesión no era válida acá, el middleware las redirigía a
  // /login (HTML) en vez de dejarlas responder. Un fetch() sigue redirects
  // por defecto, así que el caller recibía un 200 con el HTML del login en
  // vez de un error, y como esas llamadas son "fire and forget" sin chequear
  // res.ok, la falla quedaba completamente invisible (nunca se creaba la
  // notificación, y nunca se veía ningún error ni en el server ni en el navegador).
  const esApi = request.nextUrl.pathname.startsWith('/api/')

  if (!user && !isPublic && !esApi) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
