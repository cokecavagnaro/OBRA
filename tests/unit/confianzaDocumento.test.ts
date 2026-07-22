import { describe, it, expect } from 'vitest'
import {
  determinarInterpretacion,
  calcularCruce,
  calcularNetoBruto,
  debeActivarFallback,
  aplicarDescuentoGeneral,
  descuentoDeItem,
  esRazonablementeSimilar,
  TOLERANCIA_CRUCE,
  UMBRAL_BAJA,
  FACTOR_IVA,
} from '@/lib/confianzaDocumento'

describe('determinarInterpretacion', () => {
  it('detecta convención neto cuando el total ≈ suma × 1.19', () => {
    expect(determinarInterpretacion(100, 119)).toBe('neto')
  })

  it('detecta convención bruto cuando el total ≈ suma', () => {
    expect(determinarInterpretacion(119, 119)).toBe('bruto')
  })

  it('en un empate exacto entre ambas interpretaciones, favorece neto', () => {
    // sumaExtraida=100 → diferenciaComoNeto=|total-119|, diferenciaComoBruto=|total-100|
    // empatan en total=109.5
    expect(determinarInterpretacion(100, 109.5)).toBe('neto')
  })
})

describe('calcularCruce', () => {
  it('cruce válido cuando la diferencia está dentro de la tolerancia', () => {
    const r = calcularCruce([{ subtotal: 100 }], 119)
    expect(r.cruce_valido).toBe(true)
    expect(r.interpretacion).toBe('neto')
  })

  it('cruce inválido cuando la diferencia excede la tolerancia', () => {
    const r = calcularCruce([{ subtotal: 100 }], 200)
    expect(r.cruce_valido).toBe(false)
  })

  it('en el límite exacto de tolerancia, el cruce es válido', () => {
    // subtotal=119 hace que se elija interpretación 'bruto' (diferenciaComoNeto
    // sería mayor), así la diferencia final es exactamente |total - 119|.
    const r = calcularCruce([{ subtotal: 119 }], 119 + TOLERANCIA_CRUCE)
    expect(r.interpretacion).toBe('bruto')
    expect(r.diferencia).toBe(TOLERANCIA_CRUCE)
    expect(r.cruce_valido).toBe(true)
  })

  it('lista de ítems vacía da suma 0', () => {
    const r = calcularCruce([], 0)
    expect(r.suma_bruto).toBe(0)
    expect(r.cruce_valido).toBe(true)
  })
})

describe('calcularNetoBruto', () => {
  it('interpretación bruto: deriva neto dividiendo por FACTOR_IVA', () => {
    const r = calcularNetoBruto(119, 'bruto')
    expect(r.bruto).toBe(119)
    expect(r.neto).toBeCloseTo(100, 5)
    expect(r.iva).toBeCloseTo(19, 5)
  })

  it('interpretación neto: deriva bruto multiplicando por FACTOR_IVA', () => {
    const r = calcularNetoBruto(100, 'neto')
    expect(r.neto).toBe(100)
    expect(r.bruto).toBeCloseTo(100 * FACTOR_IVA, 5)
    expect(r.iva).toBeCloseTo(100 * FACTOR_IVA - 100, 5)
  })
})

describe('debeActivarFallback', () => {
  it('confianza por debajo del umbral siempre activa fallback', () => {
    expect(debeActivarFallback(0.1, true)).toBe(true)
  })

  it('cruce inválido activa fallback aunque la confianza sea alta', () => {
    expect(debeActivarFallback(0.9, false)).toBe(true)
  })

  it('confianza alta y cruce válido no activan fallback', () => {
    expect(debeActivarFallback(0.9, true)).toBe(false)
  })

  it('en el umbral exacto (comparación estricta <) no activa fallback por confianza', () => {
    expect(debeActivarFallback(UMBRAL_BAJA, true)).toBe(false)
  })
})

describe('aplicarDescuentoGeneral', () => {
  it('sin aplicar, no modifica los ítems', () => {
    const items = [{ subtotal: 100 }]
    const r = aplicarDescuentoGeneral(items, 90, false)
    expect(r).toEqual({ items, descuentoMonto: 0 })
  })

  it('si la suma original ya es <= total, no hay descuento real', () => {
    const items = [{ subtotal: 50 }, { subtotal: 40 }]
    const r = aplicarDescuentoGeneral(items, 100, true)
    expect(r.descuentoMonto).toBe(0)
    expect(r.items).toBe(items)
  })

  it('reparte el descuento proporcionalmente y el residuo de redondeo cae exacto en el total', () => {
    const items = [{ subtotal: 30 }, { subtotal: 10 }, { subtotal: 10 }]
    // factor = 28/50 = 0.56 → round(16.8)=17, round(5.6)=6, round(5.6)=6 → suma 29, residuo -1
    const r = aplicarDescuentoGeneral(items, 28, true)
    const suma = r.items.reduce((s, i) => s + i.subtotal, 0)
    expect(suma).toBe(28)
    expect(r.descuentoMonto).toBe(22)
  })

  it('el ejemplo del usuario (100 bruto, 10% descuento → 90) cuadra exacto', () => {
    const items = [{ subtotal: 50 }, { subtotal: 30 }, { subtotal: 20 }]
    const r = aplicarDescuentoGeneral(items, 90, true)
    expect(r.items.reduce((s, i) => s + i.subtotal, 0)).toBe(90)
    expect(r.descuentoMonto).toBe(10)
  })
})

describe('descuentoDeItem', () => {
  it('sin descuento (subtotal = cantidad × precio_unitario) da null', () => {
    expect(descuentoDeItem({ cantidad: 2, precio_unitario: 100, subtotal: 200 })).toBeNull()
  })

  it('diferencia de 1 peso (redondeo por cantidad decimal) se ignora', () => {
    expect(descuentoDeItem({ cantidad: 1.5, precio_unitario: 100, subtotal: 149 })).toBeNull()
  })

  it('diferencia de 2 pesos o más se reporta como descuento real', () => {
    const r = descuentoDeItem({ cantidad: 1, precio_unitario: 100, subtotal: 98 })
    expect(r).toEqual({ monto: 2, antes: 100 })
  })
})

describe('esRazonablementeSimilar', () => {
  it('totales cercanos y mismo proveedor → similar', () => {
    expect(esRazonablementeSimilar(
      { proveedor: 'Sodimac', total: 1000 },
      { proveedor: 'sodimac', total: 1005 }
    )).toBe(true)
  })

  it('proveedor vacío en cualquiera de los dos lados actúa de comodín', () => {
    expect(esRazonablementeSimilar(
      { proveedor: '', total: 1000 },
      { proveedor: 'Sodimac', total: 1000 }
    )).toBe(true)
    expect(esRazonablementeSimilar(
      { proveedor: 'Sin proveedor', total: 1000 },
      { proveedor: 'Sodimac', total: 1000 }
    )).toBe(true)
  })

  it('totales fuera de tolerancia dan no-similar aunque el proveedor coincida', () => {
    expect(esRazonablementeSimilar(
      { proveedor: 'Sodimac', total: 1000 },
      { proveedor: 'Sodimac', total: 1500 }
    )).toBe(false)
  })

  it('proveedores distintos con totales cercanos dan no-similar', () => {
    expect(esRazonablementeSimilar(
      { proveedor: 'Sodimac', total: 1000 },
      { proveedor: 'Easy', total: 1000 }
    )).toBe(false)
  })
})
