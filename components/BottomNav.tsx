'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getAllGastos, getUsuarioActual, getPermisosOverrides, getNotificaciones } from '@/lib/supabase/db'
import { tienePermiso } from '@/lib/permisos'
import type { PermissionOverride } from '@/lib/types'

const tabs = [
  { href: '/', label: 'Inicio', icon: HomeIcon },
  { href: '/scan', label: 'Escanear', icon: CameraIcon },
  { href: '/pendientes', label: 'Pendientes', icon: ClockIcon },
  { href: '/aprobaciones', label: 'Aprobar', icon: CheckIcon },
  { href: '/notificaciones', label: 'Avisos', icon: BellIcon },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [pendientes, setPendientes] = useState(0)
  const [porAprobar, setPorAprobar] = useState(0)
  const [avisos, setAvisos] = useState(0)

  useEffect(() => {
    if (pathname === '/login' || pathname.startsWith('/auth')) return

    getUsuarioActual().then(async (usuario) => {
      if (!usuario) return
      const overrides: PermissionOverride[] = await getPermisosOverrides(usuario.id)
      const esAprobador = tienePermiso(usuario, overrides, 'approve_boletas')

      const [gastos, notificaciones] = await Promise.all([getAllGastos(), getNotificaciones(usuario.id)])

      setPendientes(gastos.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length)
      setPorAprobar(
        esAprobador
          ? gastos.filter((g) => g.estado_aprobacion === 'pendiente').length
          : gastos.filter((g) => g.estado_aprobacion === 'rechazado' && g.solicitante_id === usuario.id).length
      )
      setAvisos(notificaciones.filter((n) => !n.leida).length)
    })
  }, [pathname])

  if (pathname === '/login' || pathname.startsWith('/auth')) return null

  const badges: Record<string, number> = {
    '/pendientes': pendientes,
    '/aprobaciones': porAprobar,
    '/notificaciones': avisos,
  }

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-gray-200 z-50">
      <div className="flex items-center justify-around h-16 px-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          const badge = badges[href] ?? 0
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 flex-1 py-2 relative ${
                active ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-400 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium">{label}</span>
            </Link>
          )
        })}
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

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
