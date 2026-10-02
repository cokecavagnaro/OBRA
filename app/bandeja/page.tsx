'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ItemsPendientes from '@/components/bandeja/ItemsPendientes'
import BoletasPorAprobar from '@/components/bandeja/BoletasPorAprobar'
import Avisos from '@/components/bandeja/Avisos'
import { useConteosBandeja } from '@/lib/useConteosBandeja'

type Tab = 'avisos' | 'pendientes'
type Sub = 'aprobar' | 'aprobadas' | 'notificaciones'

function Contador({ n, activo }: { n: number; activo: boolean }) {
  if (n <= 0) return null
  return (
    <span className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 border-2 border-tinta ${activo ? 'bg-dorado text-tinta' : 'bg-white text-tinta'}`}>
      {n > 99 ? '99+' : n}
    </span>
  )
}

function BandejaContenido() {
  const router = useRouter()
  const params = useSearchParams()
  const tab: Tab = params.get('tab') === 'pendientes' ? 'pendientes' : 'avisos'
  const subParam = params.get('sub')
  const sub: Sub = subParam === 'aprobadas' || subParam === 'notificaciones' ? subParam : 'aprobar'
  const proyecto = params.get('proyecto') ?? 'todas'
  const { items, porAprobar, avisos } = useConteosBandeja(`${tab}-${sub}`)

  function ir(nuevoTab: Tab, nuevoSub: Sub = sub) {
    const q = new URLSearchParams()
    q.set('tab', nuevoTab)
    if (nuevoTab === 'avisos') q.set('sub', nuevoSub)
    router.replace(`/bandeja?${q.toString()}`)
  }

  return (
    <div className="min-h-screen bg-crema">
      <div className="px-4 pt-12 pb-4 border-b-2 border-tinta bg-crema-header">
        <h1 className="text-xl font-bold text-tinta">Bandeja</h1>
        <p className="text-xs text-gris-texto mt-0.5">
          {tab === 'avisos' ? 'Boletas por aprobar y notificaciones' : 'Ítems que necesitan revisión'}
        </p>

        <div className="flex mt-4 bg-white border-2 border-tinta">
          <button
            onClick={() => ir('avisos')}
            className={`flex-1 py-2.5 text-sm font-bold flex items-center justify-center ${tab === 'avisos' ? 'bg-tinta text-dorado' : 'text-gris-medio'}`}
          >
            Avisos <Contador n={porAprobar + avisos} activo={tab === 'avisos'} />
          </button>
          <button
            onClick={() => ir('pendientes')}
            className={`flex-1 py-2.5 text-sm font-bold flex items-center justify-center border-l-2 border-tinta ${tab === 'pendientes' ? 'bg-tinta text-dorado' : 'text-gris-medio'}`}
          >
            Pendientes <Contador n={items} activo={tab === 'pendientes'} />
          </button>
        </div>

        {tab === 'avisos' && (
          <div className="flex gap-2 mt-3 overflow-x-auto">
            {([
              ['aprobar', 'Por aprobar', porAprobar],
              ['aprobadas', 'Aprobadas', 0],
              ['notificaciones', 'Notificaciones', avisos],
            ] as const).map(([k, label, n]) => (
              <button
                key={k}
                onClick={() => ir('avisos', k)}
                className={`shrink-0 border-2 border-tinta px-3 py-1.5 text-xs font-bold rounded-full ${sub === k ? 'bg-tinta text-dorado' : 'bg-white text-tinta'}`}
              >
                {label}{n > 0 ? ` · ${n}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'pendientes' && <ItemsPendientes proyectoInicial={proyecto} />}
      {tab === 'avisos' && sub === 'aprobar' && <BoletasPorAprobar vista="pendientes" />}
      {tab === 'avisos' && sub === 'aprobadas' && <BoletasPorAprobar vista="aprobadas" />}
      {tab === 'avisos' && sub === 'notificaciones' && <Avisos />}
    </div>
  )
}

export default function Bandeja() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-gris-texto text-sm">Cargando...</p></div>}>
      <BandejaContenido />
    </Suspense>
  )
}
