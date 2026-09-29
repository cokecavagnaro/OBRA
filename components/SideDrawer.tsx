'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AntLogo from '@/components/AntLogo'

const menuItems = [
  { href: '/', label: 'Inicio', icon: HomeIcon },
  { href: '/documentos', label: 'Documentos', icon: DocumentIcon },
  { href: '/scan', label: 'Escanear boleta', icon: CameraIcon },
  { href: '/mano-obra', label: 'Mano de obra', icon: WorkersIcon },
  { href: '/pendientes', label: 'Pendientes', icon: ClockIcon },
  { href: '/aprobaciones', label: 'Aprobaciones', icon: CheckIcon },
  { href: '/notificaciones', label: 'Avisos', icon: BellIcon },
]

type SideDrawerProps = {
  abierto: boolean
  cerrar: () => void
  cuenta?: string
  usuario?: string
  pendientes?: number
}

export default function SideDrawer({ abierto, cerrar, cuenta, usuario, pendientes = 0 }: SideDrawerProps) {
  const pathname = usePathname()

  useEffect(() => {
    if (!abierto) return

    const overflowAnterior = document.body.style.overflow
    const cerrarConEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cerrar()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', cerrarConEscape)

    return () => {
      document.body.style.overflow = overflowAnterior
      document.removeEventListener('keydown', cerrarConEscape)
    }
  }, [abierto, cerrar])

  return (
    <div
      className={`fixed inset-y-0 left-1/2 z-[60] w-full max-w-[390px] -translate-x-1/2 transition-[visibility] duration-300 ${
        abierto ? 'visible pointer-events-auto delay-0' : 'invisible pointer-events-none delay-300'
      }`}
      aria-hidden={!abierto}
    >
      <button
        type="button"
        aria-label="Cerrar menú"
        tabIndex={abierto ? 0 : -1}
        onClick={cerrar}
        className={`absolute inset-0 bg-slate-950/45 transition-opacity duration-300 ${abierto ? 'opacity-100' : 'opacity-0'}`}
      />

      <aside
        id="menu-lateral"
        aria-label="Menú principal"
        className={`absolute inset-y-0 left-0 flex w-[84%] max-w-[328px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-gray-100 px-5 pb-5 pt-[max(2rem,env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                <AntLogo size={26} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900">{cuenta || 'Hormigasto'}</p>
                {usuario && <p className="mt-0.5 truncate text-xs text-gray-500">{usuario}</p>}
              </div>
            </div>
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={cerrar}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <CloseIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Secciones">
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Secciones</p>
          <div className="space-y-1">
            {menuItems.map(({ href, label, icon: Icon }) => {
              const activo = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`))
              const mostrarPendientes = href === '/pendientes' && pendientes > 0

              return (
                <Link
                  key={href}
                  href={href}
                  onClick={cerrar}
                  aria-current={activo ? 'page' : undefined}
                  tabIndex={abierto ? 0 : -1}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    activo ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-6 w-6 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {mostrarPendientes && (
                    <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800">
                      {pendientes > 99 ? '99+' : pendientes}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>

          <div className="my-4 border-t border-gray-100" />
          <Link
            href="/config"
            onClick={cerrar}
            aria-current={pathname === '/config' ? 'page' : undefined}
            tabIndex={abierto ? 0 : -1}
            className={`flex min-h-12 items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              pathname === '/config' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <SettingsIcon className="h-6 w-6 shrink-0" />
            <span>Configuración</span>
          </Link>
        </nav>
      </aside>
    </div>
  )
}

type IconProps = { className?: string }

function HomeIcon({ className }: IconProps) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" /></svg>
}

function DocumentIcon({ className }: IconProps) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l4 4v14H7a2 2 0 01-2-2V5a2 2 0 012-2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 13h6M9 17h6" /></svg>
}

function CameraIcon({ className }: IconProps) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h1l1.2-1.8A2 2 0 018.86 4h6.28a2 2 0 011.66 1.2L18 7h1a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>
}

function WorkersIcon({ className }: IconProps) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
}

function ClockIcon({ className }: IconProps) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}

function CheckIcon({ className }: IconProps) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}

function BellIcon({ className }: IconProps) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M14.86 17.08a23.9 23.9 0 005.45-1.31A8.97 8.97 0 0118 9.75V9A6 6 0 006 9v.75a8.97 8.97 0 01-2.31 6.02 23.9 23.9 0 005.45 1.31m5.72 0a3 3 0 11-5.72 0" /></svg>
}

function SettingsIcon({ className }: IconProps) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.33 4.32c.42-1.76 2.92-1.76 3.34 0a1.72 1.72 0 002.58 1.06c1.54-.94 3.3.83 2.37 2.37a1.72 1.72 0 001.06 2.58c1.76.42 1.76 2.92 0 3.34a1.72 1.72 0 00-1.06 2.58c.93 1.54-.83 3.3-2.37 2.37a1.72 1.72 0 00-2.58 1.06c-.42 1.76-2.92 1.76-3.34 0a1.72 1.72 0 00-2.58-1.06c-1.54.93-3.3-.83-2.37-2.37a1.72 1.72 0 00-1.06-2.58c-1.76-.42-1.76-2.92 0-3.34a1.72 1.72 0 001.06-2.58c-.93-1.54.83-3.31 2.37-2.37a1.72 1.72 0 002.58-1.06z" /><circle cx="12" cy="12" r="3" /></svg>
}

function CloseIcon({ className }: IconProps) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
}
