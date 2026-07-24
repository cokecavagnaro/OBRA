import { describe, it, expect } from 'vitest'
import {
  determinarInterpretacion,
  determinarInterpretacionConIva,
  tolerancia,
  calcularCruce,
  calcularNetoBruto,
  debeActivarFallback,
  aplicarDescuentoGeneral,
  descuentoDeItem,
  esRazonablementeSimilar,
  reconciliarBoleta,
  reconciliarYDeterminarInterpretacion,
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

  it('con interpretación forzada, valida el cuadre contra esa interpretación sin volver a inferirla', () => {
    // Sin forzar, 100 vs 119 se detectaría como 'neto' (cuadra exacto). Forzando
    // 'bruto', debe validar 100 vs 119 tal cual (no cuadra) en vez de ignorar el forzado.
    const r = calcularCruce([{ subtotal: 100 }], 119, 'bruto')
    expect(r.interpretacion).toBe('bruto')
    expect(r.suma_bruto).toBe(100)
    expect(r.cruce_valido).toBe(false)
  })

  it('sin interpretación forzada, se comporta igual que antes (retrocompatible)', () => {
    const r = calcularCruce([{ subtotal: 155150 }], 155150)
    expect(r.interpretacion).toBe('bruto')
    expect(r.cruce_valido).toBe(true)
  })
})

describe('tolerancia', () => {
  it('usa el piso fijo TOLERANCIA_CRUCE para totales chicos', () => {
    expect(tolerancia(1000)).toBe(TOLERANCIA_CRUCE)
  })

  it('escala a 0.5% del total en boletas grandes', () => {
    expect(tolerancia(1000000)).toBe(5000)
  })
})

describe('determinarInterpretacionConIva', () => {
  it('regresión: Comercial Costa Sur — IVA impreso + suma de ítems = total → BRUTO (antes se clasificaba mal)', () => {
    // Total $155.150, IVA impreso $24.773 (neto_real=$130.377). Los ítems
    // extraídos ya suman el bruto — antes el sistema los tomaba como "neto"
    // y les sumaba 19% de más, descuadrando el total guardado.
    const r = determinarInterpretacionConIva(155150, 155150, 24773)
    expect(r.interpretacion).toBe('bruto')
    expect(r.fuente).toBe('iva_impreso')
  })

  it('caso simétrico: con IVA impreso y suma de ítems = neto real, detecta NETO', () => {
    const r = determinarInterpretacionConIva(130377, 155150, 24773)
    expect(r.interpretacion).toBe('neto')
    expect(r.fuente).toBe('iva_impreso')
  })

  it('sin IVA impreso, respeta el juicio textual de la IA aunque la aritmética sugiera lo contrario', () => {
    const r = determinarInterpretacionConIva(100, 100, null, 'neto')
    expect(r.interpretacion).toBe('neto')
    expect(r.fuente).toBe('texto_ia')
  })

  it('sin IVA impreso ni texto IA, cuadra por aritmética contra el total tal cual → bruto', () => {
    const r = determinarInterpretacionConIva(119, 119, null, undefined)
    expect(r.interpretacion).toBe('bruto')
    expect(r.fuente).toBe('cuadre_total')
  })

  it('nunca concluye "neto" solo por aritmética sin evidencia (a diferencia de la lógica vieja)', () => {
    // suma×1.19=119 ≈ total=119 — con la lógica vieja esto daba "neto" por
    // cuadre matemático. Sin iva_impreso ni texto IA, ahora no hay señal 3
    // que concluya neto: cae directo a default bruto.
    const r = determinarInterpretacionConIva(100, 119, null, undefined)
    expect(r.interpretacion).toBe('bruto')
    expect(r.fuente).toBe('default_bruto')
  })

  it('sin ninguna evidencia y sin cuadre, default duro a bruto', () => {
    const r = determinarInterpretacionConIva(50, 500, null, undefined)
    expect(r.interpretacion).toBe('bruto')
    expect(r.fuente).toBe('default_bruto')
  })

  it('iva_impreso presente pero ninguna hipótesis cuadra con la suma — cae a la siguiente señal', () => {
    const r = determinarInterpretacionConIva(999, 155150, 24773, 'neto')
    expect(r.fuente).toBe('texto_ia')
    expect(r.interpretacion).toBe('neto')
  })

  it('ivaImpreso null se trata igual que ausente', () => {
    const r = determinarInterpretacionConIva(119, 119, null)
    expect(r.fuente).toBe('cuadre_total')
  })

  it('ivaImpreso 0 no se toma como señal 1 (no hay IVA real de $0 útil para decidir)', () => {
    const r = determinarInterpretacionConIva(119, 119, 0)
    expect(r.fuente).toBe('cuadre_total')
    expect(r.interpretacion).toBe('bruto')
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

type ItemTest = { descripcion: string; subtotal: number; descuento_monto?: number | null; descuento_descripcion?: string | null }

describe('reconciliarBoleta', () => {
  it('H2: la suma ya cuadra con el total → no aplica descuentos de nuevo (doble conteo imposible)', () => {
    const items: ItemTest[] = [{ descripcion: 'Diesel', subtotal: 56247 }]
    const r = reconciliarBoleta(items, [{ descripcion: 'Descuento cupón', monto: 2461, aplica_a: 'Diesel' }], 56247)
    expect(r.cruce_valido).toBe(true)
    expect(r.items[0].subtotal).toBe(56247)
    expect(r.items[0].descuento_monto).toBeUndefined()
    expect(r.descuentoGeneralMonto).toBe(0)
  })

  it('H1: suma − descuento impreso cuadra → aplica el descuento al ítem que calza (caso COPEC)', () => {
    const items: ItemTest[] = [{ descripcion: 'Diesel', subtotal: 58708 }]
    const r = reconciliarBoleta(items, [{ descripcion: 'Descuento cupon $50/lt', monto: 2461, aplica_a: 'Diesel' }], 56247)
    expect(r.cruce_valido).toBe(true)
    expect(r.items[0].subtotal).toBe(56247)
    expect(r.items[0].descuento_monto).toBe(2461)
    expect(r.items[0].descuento_descripcion).toBe('Descuento cupon $50/lt')
    expect(r.descuentoGeneralMonto).toBe(0)
  })

  it('H1 sin aplica_a: el descuento se reparte proporcional como descuento general', () => {
    const items = [
      { descripcion: 'Cemento', subtotal: 8000 },
      { descripcion: 'Arena', subtotal: 2000 },
    ]
    const r = reconciliarBoleta(items, [{ descripcion: '10% dcto', monto: 1000, aplica_a: null }], 9000)
    expect(r.cruce_valido).toBe(true)
    expect(r.items.reduce((s, i) => s + i.subtotal, 0)).toBe(9000)
    expect(r.descuentoGeneralMonto).toBe(1000)
    expect(r.descuentoGeneralDescripcion).toBe('10% dcto')
  })

  it('H3: descuento declarado sin monto impreso → el monto se DERIVA como suma − total', () => {
    const items = [{ descripcion: 'Pintura', subtotal: 10000 }]
    const r = reconciliarBoleta(items, [{ descripcion: '2x1', monto: null, aplica_a: null }], 8000)
    expect(r.cruce_valido).toBe(true)
    expect(r.items[0].subtotal).toBe(8000)
    expect(r.descuentoGeneralMonto).toBe(2000)
  })

  it('H4: nada cuadra → cruce inválido y los ítems quedan intactos (no se inventa nada)', () => {
    const items = [{ descripcion: 'Diesel', subtotal: 53708 }]
    const r = reconciliarBoleta(items, [{ descripcion: 'Descuento', monto: 2461, aplica_a: null }], 56247)
    expect(r.cruce_valido).toBe(false)
    expect(r.items[0].subtotal).toBe(53708)
    expect(r.descuentoGeneralMonto).toBe(0)
  })

  it('sin descuentos y con descuadre real, no cuadra', () => {
    const r = reconciliarBoleta([{ descripcion: 'X', subtotal: 51247 }], [], 56247)
    expect(r.cruce_valido).toBe(false)
    expect(r.diferencia).toBe(5000)
  })

  it('descuadre de pocos pesos queda dentro de la tolerancia proporcional', () => {
    const r = reconciliarBoleta([{ descripcion: 'X', subtotal: 49998 }], [], 50000)
    expect(r.cruce_valido).toBe(true)
  })
})

describe('reconciliarYDeterminarInterpretacion', () => {
  it('regresión COPEC completa: descuento impreso + IVA + impuesto combustibles cuadran como bruto', () => {
    // Boleta real: Diesel $58.708, cupón −$2.461, Total $56.247
    // (Neto $42.400 + Imp.Comb $5.791 + IVA $8.056)
    const itemsCopec: ItemTest[] = [{ descripcion: 'Diesel', subtotal: 58708 }]
    const r = reconciliarYDeterminarInterpretacion(
      itemsCopec,
      [{ descripcion: 'Descuento cupon $50/lt', monto: 2461, aplica_a: 'Diesel' }],
      56247,
      8056,
      5791,
      'bruto'
    )
    expect(r.cruce_valido).toBe(true)
    expect(r.interpretacion).toBe('bruto')
    expect(r.items[0].subtotal).toBe(56247)
    expect(r.items[0].descuento_monto).toBe(2461)
  })

  it('boleta neta con desglose impreso: cuadra contra total − IVA − otros impuestos', () => {
    // Neto 42.400 impreso por ítem; IVA 8.056 + imp comb 5.791 → total 56.247
    const r = reconciliarYDeterminarInterpretacion(
      [{ descripcion: 'Diesel', subtotal: 42400 }],
      [],
      56247,
      8056,
      5791
    )
    expect(r.cruce_valido).toBe(true)
    expect(r.interpretacion).toBe('neto')
    expect(r.fuente).toBe('iva_impreso')
  })

  it('boleta neta clásica (Comercial Costa Sur): ítems netos + IVA impreso sin otros impuestos', () => {
    const r = reconciliarYDeterminarInterpretacion(
      [{ descripcion: 'Materiales', subtotal: 130377 }],
      [],
      155150,
      24773,
      null
    )
    expect(r.cruce_valido).toBe(true)
    expect(r.interpretacion).toBe('neto')
  })

  it('sin IVA impreso pero texto IA dice neto: valida contra total ÷ 1.19 aproximado', () => {
    const r = reconciliarYDeterminarInterpretacion(
      [{ descripcion: 'X', subtotal: 100000 }],
      [],
      119000,
      null,
      null,
      'neto'
    )
    expect(r.cruce_valido).toBe(true)
    expect(r.interpretacion).toBe('neto')
    expect(r.fuente).toBe('texto_ia')
  })

  it('nada cuadra y sin señales → default bruto con cruce inválido', () => {
    const r = reconciliarYDeterminarInterpretacion(
      [{ descripcion: 'X', subtotal: 51247 }],
      [],
      56247,
      null,
      null
    )
    expect(r.cruce_valido).toBe(false)
    expect(r.interpretacion).toBe('bruto')
    expect(r.fuente).toBe('default_bruto')
  })
})
