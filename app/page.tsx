'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCLP } from '@/lib/mock'
import { getProyectos, getAllGastos, getAllIngresos, getUsuarioActual, getCuenta } from '@/lib/supabase/db'
import type { Proyecto, Gasto, Ingreso, Usuario, Cuenta } from '@/lib/types'
import AntLogo from '@/components/AntLogo'

export default function Inicio() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getProyectos(), getAllGastos(), getAllIngresos()]).then(([o, g, i]) => {
      setProyectos(o)
      setGastos(g)
      setIngresos(i)
      setLoading(false)
    })
    getUsuarioActual().then((u) => {
      setUsuario(u)
      if (u) getCuenta(u.cuenta_id).then(setCuenta)
    })
  }, [])

  const nombreUsuario = usuario?.nombre?.trim() || usuario?.email?.split('@')[0] || ''

  const pendientesCount = gastos.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length

  const proyectosConTotales = proyectos.map((proyecto) => {
    const gastosProyecto = gastos.filter((g) => g.proyecto_id === proyecto.id)
    const total = gastosProyecto.filter((g) => g.estado_aprobacion === 'aprobado').reduce((s, g) => s + g.total, 0)
    const boletas = gastosProyecto.length
    const pendientes = gastosProyecto.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length
    const ingresado = ingresos.filter((i) => i.proyecto_id === proyecto.id).reduce((s, i) => s + i.monto, 0)
    return { ...proyecto, total, boletas, pendientes, ingresado, diferencia: ingresado - total }
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
              <Link href="/bandeja?tab=pendientes" className="flex items-center gap-1 bg-dorado/40 border-2 border-tinta rounded-full px-3 py-1">
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
      </div>

      {/* Lista de proyectos */}
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide">Proyectos</p>

        {proyectosConTotales.map((proyecto) => (
          <Link key={proyecto.id} href={`/proyecto/${proyecto.id}`}>
            <div className="border-2 border-tinta p-4 active:bg-panel bg-white shadow-hard-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-tinta text-sm">{proyecto.nombre}</p>
                  <p className="text-xs text-gris-texto mt-0.5">{proyecto.boletas} boleta{proyecto.boletas !== 1 ? 's' : ''}</p>
                </div>
                {proyecto.pendientes > 0 && (
                  <span className="inline-flex items-center gap-1 bg-dorado/40 text-tinta text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0">
                    ⚠ {proyecto.pendientes} pendiente{proyecto.pendientes > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="mt-3 pt-3 border-t-2 border-tinta grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-gris-texto font-bold uppercase tracking-wide">Ingresado</p>
                  <p className="text-[13px] font-bold text-ingreso truncate">{formatCLP(proyecto.ingresado)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gris-texto font-bold uppercase tracking-wide">Gastado</p>
                  <p className="text-[13px] font-bold text-error truncate">{formatCLP(proyecto.total)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gris-texto font-bold uppercase tracking-wide">Diferencia</p>
                  <p className={`text-[13px] font-bold truncate ${proyecto.diferencia < 0 ? 'text-error' : 'text-tinta'}`}>{formatCLP(proyecto.diferencia)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 border-2 border-tinta bg-white h-2.5">
                  <div
                    className={`h-full ${proyecto.total > proyecto.ingresado ? 'bg-error' : 'bg-dorado'}`}
                    style={{ width: `${proyecto.ingresado > 0 ? Math.min((proyecto.total / proyecto.ingresado) * 100, 100) : 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-gris-medio shrink-0">
                  {proyecto.ingresado > 0 ? Math.round((proyecto.total / proyecto.ingresado) * 100) : 0}% gastado
                </span>
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
