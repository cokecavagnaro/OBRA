'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCLP } from '@/lib/mock'
import { getProyectos, getAllGastos, getUsuarioActual, getCuenta } from '@/lib/supabase/db'
import type { Proyecto, Gasto, Usuario, Cuenta } from '@/lib/types'
import AntLogo from '@/components/AntLogo'

export default function Inicio() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getProyectos(), getAllGastos()]).then(([o, g]) => {
      setProyectos(o)
      setGastos(g)
      setLoading(false)
    })
    getUsuarioActual().then((u) => {
      setUsuario(u)
      if (u) getCuenta(u.cuenta_id).then(setCuenta)
    })
  }, [])

  const nombreUsuario = usuario?.nombre?.trim() || usuario?.email?.split('@')[0] || ''

  const pendientesCount = gastos.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length
  const totalGlobal = gastos.filter((g) => g.estado_aprobacion === 'aprobado').reduce((s, g) => s + g.total, 0)
  const totalBoletas = gastos.length

  const proyectosConTotales = proyectos.map((proyecto) => {
    const gastosProyecto = gastos.filter((g) => g.proyecto_id === proyecto.id)
    const total = gastosProyecto.filter((g) => g.estado_aprobacion === 'aprobado').reduce((s, g) => s + g.total, 0)
    const boletas = gastosProyecto.length
    const pendientes = gastosProyecto.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length
    return { ...proyecto, total, boletas, pendientes }
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gris-texto text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-crema">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 border-b-2 border-tinta bg-crema-header">
        {cuenta?.nombre && (
          <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide mb-1">{cuenta.nombre}</p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AntLogo size={28} className="text-tinta" />
            <div>
              <h1 className="text-xl font-bold text-tinta">{nombreUsuario ? `Hola, ${nombreUsuario}` : 'Hormigasto'}</h1>
              <p className="text-xs text-gris-texto mt-0.5">Tus proyectos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendientesCount > 0 && (
              <Link href="/pendientes" className="flex items-center gap-1 bg-dorado/40 border-2 border-tinta rounded-full px-3 py-1">
                <span className="w-2 h-2 bg-dorado rounded-full" />
                <span className="text-xs font-medium text-tinta">{pendientesCount} pendientes</span>
              </Link>
            )}
            <Link href="/config" className="w-9 h-9 flex items-center justify-center rounded-full border-2 border-tinta text-gris-medio">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Totales globales */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-panel p-3 border-2 border-tinta shadow-hard-sm">
            <p className="text-[11px] text-gris-texto font-medium uppercase tracking-wide">Total general</p>
            <p className="text-lg font-bold text-tinta mt-1">{formatCLP(totalGlobal)}</p>
          </div>
          <div className="bg-panel p-3 border-2 border-tinta shadow-hard-sm">
            <p className="text-[11px] text-gris-texto font-medium uppercase tracking-wide">Boletas</p>
            <p className="text-lg font-bold text-tinta mt-1">{totalBoletas}</p>
          </div>
        </div>
      </div>

      {/* Lista de proyectos */}
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide">Proyectos</p>

        {proyectosConTotales.map((proyecto) => (
          <Link key={proyecto.id} href={`/proyecto/${proyecto.id}`}>
            <div className=" border-2 border-tinta p-4 hover:border-tinta transition-colors active:bg-panel bg-white shadow-hard-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-tinta text-sm">{proyecto.nombre}</p>
                  <p className="text-xs text-gris-texto mt-0.5">{proyecto.boletas} boleta{proyecto.boletas !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-tinta">{formatCLP(proyecto.total)}</p>
                  {proyecto.pendientes > 0 && (
                    <span className="inline-flex items-center gap-1 mt-1 bg-dorado/40 text-tinta text-[10px] font-medium px-2 py-0.5 rounded-full">
                      ⚠ {proyecto.pendientes} pendiente{proyecto.pendientes > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex-1 bg-panel rounded-full h-1.5 mr-3">
                  {totalGlobal > 0 && (
                    <div
                      className="bg-dorado h-1.5 rounded-full"
                      style={{ width: `${Math.min((proyecto.total / totalGlobal) * 100, 100)}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1 text-gris-texto shrink-0">
                  <span className="text-xs">{totalGlobal > 0 ? Math.round((proyecto.total / totalGlobal) * 100) : 0}%</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {proyectosConTotales.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gris-texto text-sm">No hay proyectos registrados</p>
            <Link href="/config" className="text-dorado-link text-sm font-medium mt-2 inline-block">
              Crear primer proyecto →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
