'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getAllGastos } from '@/lib/supabase/db'

const tabs = [
  { href: '/', label: 'Inicio', icon: HomeIcon },
  { href: '/scan', label: 'Escanear', icon: CameraIcon },
  { href: '/pendientes', label: 'Pendientes', icon: ClockIcon },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    if (pathname === '/login' || pathname.startsWith('/auth')) return
    getAllGastos().then((gastos) => {
      const count = gastos.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length
      setPendientes(count)
    })
  }, [pathname])

  if (pathname === '/login' || pathname.startsWith('/auth')) return null

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-gray-200 z-50">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          const isPendientes = href === '/pendientes'
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 flex-1 py-2 relative ${
                active ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <div className="relative">
                <Icon className="w-6 h-6" />
                {isPendientes && pendientes > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-400 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {pendientes > 9 ? '9+' : pendientes}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
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
