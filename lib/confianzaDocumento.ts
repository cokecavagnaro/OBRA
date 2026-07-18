export const UMBRAL_BAJA = 0.40
export const UMBRAL_ALTA = 0.75
export const TOLERANCIA_CRUCE = 10 // pesos — no es escala de confianza
export const FACTOR_IVA = 1.19

export type InterpretacionPrecio = 'neto' | 'bruto'

export interface ResultadoCruce {
  suma_bruto: number
  diferencia: number
  cruce_valido: boolean
  interpretacion: InterpretacionPrecio
}

// Decide, solo con aritmética, si los precios de esta boleta ya vienen en
// bruto o si hay que aplicarles IVA para llegar al total — prueba ambas
// interpretaciones contra el total real y se queda con la que más cuadre.
// No depende de que la IA clasifique nada: distintas boletas usan distintas
// convenciones (neto+IVA desglosado vs. bruto directo) y esto lo detecta caso
// a caso.
export function determinarInterpretacion(sumaExtraida: number, total: number): InterpretacionPrecio {
  const diferenciaComoNeto = Math.abs(total - sumaExtraida * FACTOR_IVA)
  const diferenciaComoBruto = Math.abs(total - sumaExtraida)
  return diferenciaComoNeto <= diferenciaComoBruto ? 'neto' : 'bruto'
}

export function calcularCruce(items: { subtotal: number }[], total: number): ResultadoCruce {
  const sumaExtraida = items.reduce((acc, item) => acc + (item.subtotal ?? 0), 0)
  const interpretacion = determinarInterpretacion(sumaExtraida, total)
  const suma_bruto = interpretacion === 'neto' ? sumaExtraida * FACTOR_IVA : sumaExtraida
  const diferencia = Math.abs(total - suma_bruto)
  return { suma_bruto, diferencia, cruce_valido: diferencia <= TOLERANCIA_CRUCE, interpretacion }
}

// Dado el subtotal tal como se extrajo y la interpretación ya decidida para
// ESA boleta (misma para todos sus ítems), devuelve neto/bruto/iva del ítem.
export function calcularNetoBruto(
  subtotalExtraido: number,
  interpretacion: InterpretacionPrecio
): { neto: number; bruto: number; iva: number } {
  if (interpretacion === 'bruto') {
    const neto = subtotalExtraido / FACTOR_IVA
    return { neto, bruto: subtotalExtraido, iva: subtotalExtraido - neto }
  }
  const bruto = subtotalExtraido * FACTOR_IVA
  return { neto: subtotalExtraido, bruto, iva: bruto - subtotalExtraido }
}

export function debeActivarFallback(confianza_documento: number, cruce_valido: boolean): boolean {
  return confianza_documento < UMBRAL_BAJA || cruce_valido === false
}

function normalizarProveedor(p: string | undefined | null): string {
  return (p ?? '').trim().toLowerCase()
}

// "Razonablemente similar" para la reconciliación post-fallback: totales
// dentro de TOLERANCIA_CRUCE Y proveedor normalizado igual (vacío/"sin
// proveedor" cuenta como comodín en cualquiera de los dos lados, para no
// penalizar un proveedor ausente).
export function esRazonablementeSimilar(
  original: { proveedor: string; total: number },
  fallback: { proveedor: string; total: number }
): boolean {
  const totalesCercanos = Math.abs(original.total - fallback.total) <= TOLERANCIA_CRUCE
  const provOriginal = normalizarProveedor(original.proveedor)
  const provFallback = normalizarProveedor(fallback.proveedor)
  const esComodin = (p: string) => p === '' || p === 'sin proveedor'
  const proveedorCoincide = esComodin(provOriginal) || esComodin(provFallback) || provOriginal === provFallback
  return totalesCercanos && proveedorCoincide
}
