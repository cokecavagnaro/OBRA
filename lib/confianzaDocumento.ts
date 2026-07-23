export const UMBRAL_BAJA = 0.40
export const UMBRAL_ALTA = 0.75
export const TOLERANCIA_CRUCE = 10 // pesos — no es escala de confianza
export const FACTOR_IVA = 1.19

export type InterpretacionPrecio = 'neto' | 'bruto'

// De dónde salió la decisión bruto/neto — para poder auditarla y mostrarla,
// en orden de confiabilidad decreciente (ver determinarInterpretacionConIva).
export type FuenteInterpretacion = 'iva_impreso' | 'texto_ia' | 'cuadre_total' | 'default_bruto'

export interface ResultadoCruce {
  suma_bruto: number
  diferencia: number
  cruce_valido: boolean
  interpretacion: InterpretacionPrecio
}

export interface ResultadoInterpretacionConIva {
  interpretacion: InterpretacionPrecio
  fuente: FuenteInterpretacion
}

// Decide, solo con aritmética, si los precios de esta boleta ya vienen en
// bruto o si hay que aplicarles IVA para llegar al total — prueba ambas
// interpretaciones contra el total real y se queda con la que más cuadre.
// No depende de que la IA clasifique nada: distintas boletas usan distintas
// convenciones (neto+IVA desglosado vs. bruto directo) y esto lo detecta caso
// a caso.
// NOTA: esta función queda como utilidad de comparación de bajo nivel (la
// usa calcularCruce para VALIDAR un cuadre, no para decidir la interpretación
// de una boleta) — la decisión real vive en determinarInterpretacionConIva.
export function determinarInterpretacion(sumaExtraida: number, total: number): InterpretacionPrecio {
  const diferenciaComoNeto = Math.abs(total - sumaExtraida * FACTOR_IVA)
  const diferenciaComoBruto = Math.abs(total - sumaExtraida)
  return diferenciaComoNeto <= diferenciaComoBruto ? 'neto' : 'bruto'
}

// Tolerancia proporcional al monto: TOLERANCIA_CRUCE fijo como piso para
// boletas chicas, hasta 0.5% del total en boletas grandes — evita exigir
// cuadre-al-peso cuando el redondeo por línea se acumula en boletas con
// muchos ítems.
export function tolerancia(total: number): number {
  return Math.max(TOLERANCIA_CRUCE, Math.round(Math.abs(total) * 0.005))
}

// Fuente de verdad para bruto/neto — jerarquía de 4 señales, de más a menos
// confiable:
//  1. IVA impreso explícito (dato real de la boleta, no una suposición del
//     19%): si sumaExtraida cuadra con el neto implícito (total - iva) → neto;
//     si cuadra con el total tal cual → bruto.
//  2. Juicio textual de la IA (ya leyó la boleta buscando evidencia
//     explícita) — se respeta tal cual, sin pisarlo con aritmética.
//  3. Cuadre aritmético contra el total tal cual → bruto. Nunca concluye
//     "neto" por esta vía: adivinar neto por distancia matemática (comparando
//     contra suma×1.19) fue la causa raíz del bug de clasificación errónea.
//  4. Sin ninguna evidencia → default duro a bruto.
export function determinarInterpretacionConIva(
  sumaExtraida: number,
  total: number,
  ivaImpreso: number | null | undefined,
  interpretacionTextoIA?: InterpretacionPrecio
): ResultadoInterpretacionConIva {
  const tol = tolerancia(total)

  if (typeof ivaImpreso === 'number' && ivaImpreso > 0) {
    const netoReal = total - ivaImpreso
    if (Math.abs(sumaExtraida - netoReal) <= tol) return { interpretacion: 'neto', fuente: 'iva_impreso' }
    if (Math.abs(sumaExtraida - total) <= tol) return { interpretacion: 'bruto', fuente: 'iva_impreso' }
    // iva_impreso existe pero ninguna hipótesis cuadra con la suma de ítems
    // (ítem faltante/mal leído) — no decide con este dato, cae a la próxima señal.
  }

  if (interpretacionTextoIA === 'neto' || interpretacionTextoIA === 'bruto') {
    return { interpretacion: interpretacionTextoIA, fuente: 'texto_ia' }
  }

  if (Math.abs(sumaExtraida - total) <= tol) {
    return { interpretacion: 'bruto', fuente: 'cuadre_total' }
  }

  return { interpretacion: 'bruto', fuente: 'default_bruto' }
}

export function calcularCruce(
  items: { subtotal: number }[],
  total: number,
  interpretacionForzada?: InterpretacionPrecio
): ResultadoCruce {
  const sumaExtraida = items.reduce((acc, item) => acc + (item.subtotal ?? 0), 0)
  const interpretacion = interpretacionForzada ?? determinarInterpretacion(sumaExtraida, total)
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

// Cuando la IA marca que la boleta tiene un descuento general (aplicado al
// total, no a un ítem puntual), reparte ese descuento proporcionalmente
// entre los ítems para que su suma vuelva a cuadrar con el total realmente
// pagado — antes de correr calcularCruce, para no disparar un fallback
// innecesario por un "descuadre" que en realidad es el descuento.
export function aplicarDescuentoGeneral<T extends { subtotal: number }>(
  items: T[],
  total: number,
  aplica: boolean
): { items: T[]; descuentoMonto: number } {
  if (!aplica) return { items, descuentoMonto: 0 }
  const sumaOriginal = items.reduce((acc, item) => acc + (item.subtotal ?? 0), 0)
  if (sumaOriginal <= total) return { items, descuentoMonto: 0 }

  const factor = total / sumaOriginal
  const ajustados = items.map((item) => ({ ...item, subtotal: Math.round(item.subtotal * factor) }))
  const residuo = total - ajustados.reduce((acc, item) => acc + item.subtotal, 0)
  if (residuo !== 0 && ajustados.length > 0) {
    const idxMayor = ajustados.reduce((iMax, item, idx, arr) => (item.subtotal > arr[iMax].subtotal ? idx : iMax), 0)
    ajustados[idxMayor].subtotal += residuo
  }
  return { items: ajustados, descuentoMonto: sumaOriginal - total }
}

// Descuento contenido en un ítem específico (no toca el total de la
// boleta): se infiere de que el subtotal final quedó por debajo de
// cantidad × precio_unitario — no requiere un campo separado.
export function descuentoDeItem(item: {
  cantidad: number
  precio_unitario: number
  subtotal: number
}): { monto: number; antes: number } | null {
  const antes = Math.round(item.cantidad * item.precio_unitario)
  const monto = antes - Math.round(item.subtotal)
  // Cantidades con decimales (ej. litros) generan diferencias de 1 peso por
  // puro redondeo — no es un descuento real, así que se ignoran.
  if (monto <= 1) return null
  return { monto, antes }
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
