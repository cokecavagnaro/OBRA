'use client'

import { calcularCruce, calcularNetoBruto, type InterpretacionPrecio } from '@/lib/confianzaDocumento'
import { formatCLP } from '@/lib/mock'

interface Props {
  items: { subtotal: number; exento?: boolean | null }[]
  total: number
  interpretacion?: InterpretacionPrecio
  ivaImpreso?: number | null
  otrosImpuestos?: number | null
  variante?: 'compacta' | 'detallada'
}

export default function CruceItemsTotal({ items, total, interpretacion, ivaImpreso, otrosImpuestos, variante = 'compacta' }: Props) {
  const { suma_bruto, diferencia, cruce_valido } = calcularCruce(items, total, interpretacion)
  // Se suma ítem a ítem (no sobre el total bruto) porque un flete exento no
  // lleva IVA y dividirlo por 1.19 junto al resto daría un neto falso.
  const sumaNeta = items.reduce(
    (acc, i) => acc + calcularNetoBruto(i.subtotal ?? 0, interpretacion ?? 'bruto', i.exento).neto,
    0
  )
  const totalExento = items.reduce((acc, i) => acc + (i.exento ? (i.subtotal ?? 0) : 0), 0)

  return (
    <div className={`rounded-xl p-3 border ${cruce_valido ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-200'}`}>
      {variante === 'detallada' && (
        <div className="space-y-0.5 mb-2 pb-2 border-b border-black/5">
          <FilaMonto label="Total boleta" valor={total} />
          {typeof ivaImpreso === 'number' && ivaImpreso > 0 && (
            <>
              <FilaMonto label="IVA impreso" valor={ivaImpreso} />
              {typeof otrosImpuestos === 'number' && otrosImpuestos > 0 && (
                <FilaMonto label="Otros impuestos" valor={otrosImpuestos} />
              )}
              <FilaMonto label="Neto implícito" valor={total - ivaImpreso - (otrosImpuestos ?? 0)} />
            </>
          )}
          {totalExento > 0 && <FilaMonto label="Exento de IVA (fletes/servicios)" valor={totalExento} />}
          <FilaMonto label="Suma de ítems (neto)" valor={sumaNeta} />
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Suma de ítems</span>
        <span className="font-semibold text-gray-800">{formatCLP(suma_bruto)}</span>
      </div>
      <div className="flex items-center justify-between text-sm mt-0.5">
        <span className="text-gray-500">Total boleta</span>
        <span className="font-semibold text-gray-800">{formatCLP(total)}</span>
      </div>
      <p className={`text-xs mt-1.5 font-semibold ${cruce_valido ? 'text-green-700' : 'text-amber-700'}`}>
        {cruce_valido ? '✓ Cuadra' : `⚠ Descuadre de ${formatCLP(diferencia)}`}
      </p>
    </div>
  )
}

function FilaMonto({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-600">{formatCLP(valor)}</span>
    </div>
  )
}
