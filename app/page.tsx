'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCLP } from '@/lib/mock'
import { getObras, getAllGastos, getUsuarioActual, getCuenta } from '@/lib/supabase/db'
import type { Obra, Gasto, Usuario, Cuenta } from '@/lib/types'
import AntLogo from '@/components/AntLogo'

export default function Inicio() {
  const [obras, setObras] = useState<Obra[]>([])
  const [gastos, setGastos] = useState<Gasto[]>([])
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getObras(), getAllGastos()]).then(([o, g]) => {
      setObras(o)
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
  const totalGlobal = gastos.reduce((s, g) => s + g.total, 0)
  const totalBoletas = gastos.length

  const obrasConTotales = obras.map((obra) => {
    const gastosObra = gastos.filter((g) => g.obra_id === obra.id)
    const total = gastosObra.reduce((s, g) => s + g.total, 0)
    const boletas = gastosObra.length
    const pendientes = gastosObra.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length
    return { ...obra, total, boletas, pendientes }
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        {cuenta?.nombre && (
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{cuenta.nombre}</p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AntLogo size={28} className="text-gray-900" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">{nombreUsuario ? `Hola, ${nombreUsuario}` : 'Hormigasto'}</h1>
              <p className="text-xs text-gray-400 mt-0.5">Tus obras</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendientesCount > 0 && (
              <Link href="/pendientes" className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                <span className="w-2 h-2 bg-amber-400 rounded-full" />
                <span className="text-xs font-medium text-amber-700">{pendientesCount} pendientes</span>
              </Link>
            )}
            <Link href="/config" className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 text-gray-500">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Totales globales */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Total general</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{formatCLP(totalGlobal)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Boletas</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{totalBoletas}</p>
          </div>
        </div>
      </div>

      {/* Lista de obras */}
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Obras</p>

        {obrasConTotales.map((obra) => (
          <Link key={obra.id} href={`/obra/${obra.id}`}>
            <div className="rounded-xl border border-gray-100 p-4 hover:border-gray-200 transition-colors active:bg-gray-50">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{obra.nombre}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{obra.boletas} boleta{obra.boletas !== 1 ? 's' : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900">{formatCLP(obra.total)}</p>
                  {obra.pendientes > 0 && (
                    <span className="inline-flex items-center gap-1 mt-1 bg-amber-100 text-amber-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
                      ⚠ {obra.pendientes} pendiente{obra.pendientes > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5 mr-3">
                  {totalGlobal > 0 && (
                    <div
                      className="bg-blue-500 h-1.5 rounded-full"
                      style={{ width: `${Math.min((obra.total / totalGlobal) * 100, 100)}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1 text-gray-400 shrink-0">
                  <span className="text-xs">{totalGlobal > 0 ? Math.round((obra.total / totalGlobal) * 100) : 0}%</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {obrasConTotales.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">No hay obras registradas</p>
            <Link href="/config" className="text-blue-600 text-sm font-medium mt-2 inline-block">
              Crear primera obra →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
