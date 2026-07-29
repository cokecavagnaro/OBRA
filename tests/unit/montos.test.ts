import { describe, it, expect } from 'vitest'
import { parsearNumero, parsearMontoCLP } from '@/lib/montos'
import { reconciliarYDeterminarInterpretacion } from '@/lib/confianzaDocumento'

describe('parsearMontoCLP — convención chilena', () => {
  it('regresión: el total que entró 100x inflado', () => {
    // Bug real: el prompt pedía el monto "sin puntos ni símbolos" y no decía
    // nada de la coma decimal, así que $66.791,73 salía como 6.679.173.
    expect(parsearMontoCLP('$66.791,73')).toBe(66792)
  })

  it('punto como separador de miles', () => {
    expect(parsearMontoCLP('$58.708')).toBe(58708)
    expect(parsearMontoCLP('$4.318')).toBe(4318)
    expect(parsearMontoCLP('$10.000')).toBe(10000)
    expect(parsearMontoCLP('$1.000.000')).toBe(1000000)
  })

  it('coma decimal con punto de miles', () => {
    expect(parsearMontoCLP('$1.234,56')).toBe(1235)
    expect(parsearMontoCLP('56.127,50')).toBe(56128)
  })

  it('formato anglosajón: el último separador manda igual', () => {
    expect(parsearMontoCLP('1,234.56')).toBe(1235)
    expect(parsearMontoCLP('66,791.73')).toBe(66792)
  })

  it('sin separadores', () => {
    expect(parsearMontoCLP('49900')).toBe(49900)
    expect(parsearMontoCLP('$ 7967')).toBe(7967)
  })

  it('ignora símbolos, texto y espacios alrededor', () => {
    expect(parsearMontoCLP('  $ 59.900 CLP ')).toBe(59900)
    expect(parsearMontoCLP('Total: $56.247')).toBe(56247)
  })

  it('acepta números ya parseados sin romper', () => {
    expect(parsearMontoCLP(58708)).toBe(58708)
    expect(parsearMontoCLP(66791.73)).toBe(66792)
  })

  it('devuelve null cuando no hay nada que interpretar', () => {
    expect(parsearMontoCLP('')).toBeNull()
    expect(parsearMontoCLP('gratis')).toBeNull()
    expect(parsearMontoCLP(null)).toBeNull()
    expect(parsearMontoCLP(undefined)).toBeNull()
    expect(parsearMontoCLP(NaN)).toBeNull()
  })

  it('conserva el signo negativo', () => {
    expect(parsearMontoCLP('-$2.461')).toBe(-2461)
  })
})

describe('parsearNumero — cantidades con decimales', () => {
  it('conserva los decimales de una cantidad (litros de combustible)', () => {
    // COPEC imprime "49,21 Lt" — redondear acá falsearía el precio por litro.
    expect(parsearNumero('49,21 Lt')).toBeCloseTo(49.21, 5)
  })

  it('cantidad entera', () => {
    expect(parsearNumero('13')).toBe(13)
  })

  it('un separador con 3 dígitos sigue siendo de miles, no decimal', () => {
    expect(parsearNumero('1.500')).toBe(1500)
  })

  it('un separador con 1 o 2 dígitos es decimal', () => {
    expect(parsearNumero('0,5')).toBeCloseTo(0.5, 5)
    expect(parsearNumero('2.75')).toBeCloseTo(2.75, 5)
  })
})

describe('regresión boleta B — pedido con centavos y sin monto de línea', () => {
  it('el total con coma decimal y el subtotal derivado hacen cuadrar la boleta', () => {
    // Lo que la boleta imprime: "Precio: $4.318", "Cantidad: 13" y
    // "Pagaste en total: $66.791,73" — sin monto de línea y sin IVA desglosado.
    const total = parsearMontoCLP('$66.791,73')!
    const cantidad = parsearNumero('13')!
    const precioUnitario = parsearMontoCLP('$4.318')!
    // La línea no imprime su monto: lo multiplica el servidor, no la IA.
    const subtotal = Math.round(cantidad * precioUnitario)

    expect(total).toBe(66792)
    expect(subtotal).toBe(56134)

    const r = reconciliarYDeterminarInterpretacion(
      [{ descripcion: 'Foco Embutido Hermético Fijo GU-10 IP65 Blanco', subtotal }],
      [],
      total,
      null,
      null,
      'neto'
    )
    expect(r.cruce_valido).toBe(true)
    expect(r.interpretacion).toBe('neto')
  })

  it('con el bug viejo el total quedaba 100x inflado y nada podía cuadrar', () => {
    // Borrar los separadores como pedía el prompt anterior daba 6.679.173.
    const totalMalLeido = 6679173
    const r = reconciliarYDeterminarInterpretacion(
      [{ descripcion: 'Foco', subtotal: 56134 }],
      [],
      totalMalLeido,
      null,
      null,
      'neto'
    )
    expect(r.cruce_valido).toBe(false)
  })
})
