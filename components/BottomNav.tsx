'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useConteosBandeja } from '@/lib/useConteosBandeja'

export default function BottomNav() {
  const pathname = usePathname()
  const oculto = pathname === '/login' || pathname.startsWith('/auth')
  const conteos = useConteosBandeja(pathname, !oculto)

  if (oculto) return null

  const bandeja = conteos.items + conteos.porAprobar + conteos.avisos

  return (
    <nav aria-label="Navegación principal" className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-crema-header border-t-2 border-tinta pb-[env(safe-area-inset-bottom)] z-50">
      <div className="grid grid-cols-[1fr_1.7fr_1fr] items-end h-[88px] px-1">
        <Link
          href="/"
          aria-current={pathname === '/' ? 'page' : undefined}
          className={`flex min-w-0 flex-col items-center justify-center gap-1 min-h-[72px] py-2 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tinta focus-visible:ring-inset ${pathname === '/' ? 'text-tinta' : 'text-gris-medio'}`}
        >
          <HomeIcon className="w-7 h-7" />
          <span className="text-xs min-[390px]:text-[13px] font-bold leading-5">Inicio</span>
          {pathname === '/' && <span className="absolute bottom-0.5 w-5 h-[3px] bg-tinta" />}
        </Link>

        <Link
          href="/scan"
          className="justify-self-center -mt-10 w-[104px] h-[84px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tinta focus-visible:ring-offset-2 bg-dorado border-[3px] border-tinta shadow-hard-lg flex flex-col items-center justify-center gap-0.5 text-tinta font-bold text-xs tracking-wide active:translate-x-[3px] active:translate-y-[3px] active:shadow-hard-sm"
        >
          <CameraIcon className="w-9 h-9" />
          <span>ESCANEAR</span>
        </Link>

        <Link
          href="/bandeja"
          aria-current={pathname === '/bandeja' ? 'page' : undefined}
          className={`flex min-w-0 flex-col items-center justify-center gap-1 min-h-[72px] py-2 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tinta focus-visible:ring-inset ${pathname === '/bandeja' ? 'text-tinta' : 'text-gris-medio'}`}
        >
          <div className="relative">
            <BellIcon className="w-7 h-7" />
            {bandeja > 0 && (
              <span className="absolute -top-1 -right-2 bg-dorado border-2 border-tinta text-tinta text-[10px] font-bold rounded-full min-w-4 h-4 px-0.5 flex items-center justify-center">
                {bandeja > 9 ? '9+' : bandeja}
              </span>
            )}
          </div>
          <span className="text-xs min-[390px]:text-[13px] font-bold leading-5">Bandeja</span>
          {pathname === '/bandeja' && <span className="absolute bottom-0.5 w-5 h-[3px] bg-tinta" />}
        </Link>
      </div>
    </nav>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}
