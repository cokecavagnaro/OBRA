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
//     19%): si sumaExtraida cuadra con el neto implícito (total - iva -
//     otros impuestos) → neto; si cuadra con el total tal cual → bruto.
//     otrosImpuestos cubre impuestos impresos distintos del IVA (imp.
//     específico a los combustibles, etc.) — sin él, una boleta de bencinera
//     jamás cuadra como neto aunque el desglose esté impreso completo.
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
  interpretacionTextoIA?: InterpretacionPrecio,
  otrosImpuestos?: number | null
): ResultadoInterpretacionConIva {
  const tol = tolerancia(total)

  if (typeof ivaImpreso === 'number' && ivaImpreso > 0) {
    const netoReal = total - ivaImpreso - (otrosImpuestos ?? 0)
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
  items: { subtotal: number; exento?: boolean | null }[],
  total: number,
  interpretacionForzada?: InterpretacionPrecio
): ResultadoCruce {
  const sumaExtraida = items.reduce((acc, item) => acc + (item.subtotal ?? 0), 0)
  const interpretacion = interpretacionForzada ?? determinarInterpretacion(sumaExtraida, total)
  // Los ítems exentos (fletes sin IVA) pasan a bruto tal cual: llevarlos a
  // ×1.19 junto con el resto haría que una boleta correcta nunca cuadre.
  const suma_bruto = items.reduce((acc, item) => {
    const sub = item.subtotal ?? 0
    return acc + (interpretacion === 'neto' && !item.exento ? sub * FACTOR_IVA : sub)
  }, 0)
  const diferencia = Math.abs(total - suma_bruto)
  // Tolerancia proporcional (no el piso fijo): un descuadre de pocos pesos por
  // redondeo acumulado no le importa a nadie y no debe frenar el flujo.
  return { suma_bruto, diferencia, cruce_valido: diferencia <= tolerancia(total), interpretacion }
}

// Dado el subtotal tal como se extrajo y la interpretación ya decidida para
// ESA boleta, devuelve neto/bruto/iva del ítem. Un ítem exento (flete que la
// boleta cobra sin IVA) ignora la interpretación: su neto y su bruto son el
// mismo monto y no aporta IVA — cobrarle 19% inventaría crédito fiscal.
export function calcularNetoBruto(
  subtotalExtraido: number,
  interpretacion: InterpretacionPrecio,
  exento?: boolean | null
): { neto: number; bruto: number; iva: number } {
  if (exento) {
    return { neto: subtotalExtraido, bruto: subtotalExtraido, iva: 0 }
  }
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

// Línea de descuento tal como la IA la COPIÓ de la boleta (nunca calculada):
// monto es la cifra impresa positiva, o null si el descuento se menciona sin
// monto (ej. "2x1"); aplica_a es la descripción del ítem al que pertenece si
// la boleta lo deja claro, o null si es general.
export interface DescuentoImpreso {
  descripcion: string
  monto: number | null
  aplica_a: string | null
}

// Línea que SUMA al total y no es un producto: envío, despacho, flete,
// servicio, instalación, recargo. Espejo de DescuentoImpreso — la IA copia la
// cifra impresa, nunca la calcula. Sin esta casilla en el esquema la IA no
// tenía dónde poner el flete: lo omitía (dejando la boleta imposible de
// cuadrar) o lo colaba como si fuera un material.
export interface CargoImpreso {
  descripcion: string
  monto: number | null
}

// Las boletas imprimen el flete con textos larguísimos e irrepetibles (un caso
// real: "Envío: Lo Barnechea, Puente Alto, La Pintana, El Bosque, ..." con 13
// comunas). Como ítem del carrusel es ilegible, y como llave de aprendizaje es
// inservible: ninguna otra boleta repite esa lista, así que el sistema nunca
// aprendería a clasificar envíos solo. Se guarda una etiqueta corta y estable
// para que aplicarAprendizajeDeterministico la reconozca boleta tras boleta.
export function descripcionCanonicaCargo(texto: string): string {
  const t = normalizarTexto(texto)
  if (t.includes('despacho')) return 'Despacho'
  if (t.includes('flete')) return 'Flete'
  if (t.includes('envio') || t.includes('envío')) return 'Envío'
  if (t.includes('instalacion') || t.includes('instalación')) return 'Instalación'
  if (t.includes('servicio')) return 'Servicio'
  return 'Cargo adicional'
}

export interface ResultadoReconciliacion<T> {
  items: T[]
  descuentoGeneralMonto: number
  descuentoGeneralDescripcion: string | null
  // Cargos que la aritmética confirmó como parte del total. El llamador los
  // materializa como ítems (acá no se puede: T es genérico y construir uno
  // requeriría conocer su forma concreta).
  cargosAplicados: CargoImpreso[]
  cruce_valido: boolean
  diferencia: number
}

function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

// Reconciliación determinística de la boleta: la IA solo transcribe cifras
// impresas (subtotales por línea + líneas de descuento por separado) y acá
// se decide, con aritmética real, si esos descuentos ya estaban incorporados
// en los subtotales o hay que aplicarlos — el doble conteo y los montos
// alucinados (causa del bug COPEC: descuento de $5.000 inventado + cupón
// duplicado como ítem negativo) se vuelven estructuralmente imposibles.
//
// Hipótesis, en orden:
//  H2 primero (suma ya cuadra con el total): los descuentos, si los hay, ya
//     venían dentro de los subtotales — aplicarlos de nuevo sería doble
//     conteo, así que no se toca nada. Va antes que H1 a propósito: ante la
//     duda, nunca restar dos veces.
//  H1 (suma + cargos − descuentos impresos cuadra): los descuentos son reales
//     y NO están en los subtotales — se aplican: al ítem que calza con
//     aplica_a (queda registrado en descuento_monto/descuento_descripcion del
//     ítem), o proporcionalmente como descuento general si no es atribuible.
//     Los cargos impresos (flete/despacho) se confirman en la misma ecuación y
//     se devuelven en cargosAplicados para que el llamador los materialice
//     como ítems etiquetables.
//  H3 (hay descuento declarado SIN monto impreso y la suma excede el total):
//     el monto se DERIVA como suma − total y se reparte proporcional — misma
//     aritmética de servidor que ya usaba aplicarDescuentoGeneral.
//  H4 (nada cuadra): no se "arregla" nada inventando — se devuelve
//     cruce_valido: false y los ítems intactos, para que la compuerta de
//     revisión de totales lo frene antes del etiquetado.
export function reconciliarBoleta<T extends {
  descripcion: string
  subtotal: number
  descuento_monto?: number | null
  descuento_descripcion?: string | null
}>(
  items: T[],
  descuentos: DescuentoImpreso[],
  total: number,
  cargos: CargoImpreso[] = []
): ResultadoReconciliacion<T> {
  const tol = tolerancia(total)
  const suma = items.reduce((acc, i) => acc + (i.subtotal ?? 0), 0)
  const conMonto = descuentos.filter((d) => typeof d.monto === 'number' && d.monto > 0)
  const sumaDescuentos = conMonto.reduce((acc, d) => acc + (d.monto as number), 0)
  const cargosConMonto = cargos.filter((c) => typeof c.monto === 'number' && c.monto > 0)
  const sumaCargos = cargosConMonto.reduce((acc, c) => acc + (c.monto as number), 0)

  // H2 — va primero a propósito: si la suma ya cuadra, un cargo listado ya
  // venía dentro de los ítems y sumarlo otra vez sería doble conteo.
  if (Math.abs(suma - total) <= tol) {
    return { items, descuentoGeneralMonto: 0, descuentoGeneralDescripcion: null, cargosAplicados: [], cruce_valido: true, diferencia: Math.abs(suma - total) }
  }

  // H1 — con sumaCargos en 0 se comporta igual que antes de existir los cargos.
  if ((sumaDescuentos > 0 || sumaCargos > 0) && Math.abs(suma + sumaCargos - sumaDescuentos - total) <= tol) {
    let ajustados = items.map((i) => ({ ...i }))
    let generalMonto = 0
    const generalDescripciones: string[] = []

    for (const d of conMonto) {
      const objetivo = normalizarTexto(d.aplica_a)
      const idx = objetivo
        ? ajustados.findIndex((i) => {
            const desc = normalizarTexto(i.descripcion)
            return desc === objetivo || desc.includes(objetivo) || objetivo.includes(desc)
          })
        : -1
      if (idx >= 0) {
        ajustados[idx].subtotal = Math.round(ajustados[idx].subtotal - (d.monto as number))
        ajustados[idx].descuento_monto = (ajustados[idx].descuento_monto ?? 0) + (d.monto as number)
        ajustados[idx].descuento_descripcion = d.descripcion || ajustados[idx].descuento_descripcion || null
      } else {
        generalMonto += d.monto as number
        if (d.descripcion) generalDescripciones.push(d.descripcion)
      }
    }

    if (generalMonto > 0) {
      const sumaActual = ajustados.reduce((acc, i) => acc + i.subtotal, 0)
      ajustados = aplicarDescuentoGeneral(ajustados, sumaActual - generalMonto, true).items
    }

    const sumaFinal = ajustados.reduce((acc, i) => acc + i.subtotal, 0) + sumaCargos
    const diferencia = Math.abs(sumaFinal - total)
    return {
      items: ajustados,
      descuentoGeneralMonto: generalMonto,
      descuentoGeneralDescripcion: generalDescripciones.length > 0 ? generalDescripciones.join('; ') : null,
      cargosAplicados: cargosConMonto,
      cruce_valido: diferencia <= tol,
      diferencia,
    }
  }

  // H3
  const sinMonto = descuentos.filter((d) => d.monto == null)
  if (sinMonto.length > 0 && suma > total) {
    const { items: ajustados, descuentoMonto } = aplicarDescuentoGeneral(items.map((i) => ({ ...i })), total, true)
    const descripciones = sinMonto.map((d) => d.descripcion).filter(Boolean)
    return {
      items: ajustados,
      descuentoGeneralMonto: descuentoMonto,
      descuentoGeneralDescripcion: descripciones.length > 0 ? descripciones.join('; ') : null,
      cargosAplicados: [],
      cruce_valido: true,
      diferencia: 0,
    }
  }

  // H4
  return { items, descuentoGeneralMonto: 0, descuentoGeneralDescripcion: null, cargosAplicados: [], cruce_valido: false, diferencia: Math.abs(suma - total) }
}

export interface ResultadoReconciliacionCompleta<T> extends ResultadoReconciliacion<T> {
  interpretacion: InterpretacionPrecio
  fuente: FuenteInterpretacion
  cargosExentos: boolean
}

// ¿El flete viene sin IVA? No se adivina: se prueban las dos hipótesis contra
// el IVA IMPRESO y gana la que calce. Caso real (pedido #42953): productos
// $49.900 + envío $10.000 = $59.900, con "$7.967 IVA" impreso. Tratando el
// envío como gravado el IVA daría $9.564; tratándolo exento da $7.967 exacto
// — o sea el envío no pagó IVA, y cobrárselo inflaría el crédito fiscal del
// proyecto en un 20%.
//
// Sin IVA impreso no hay evidencia y el default es GRAVADO: en Chile el flete
// que cobra el propio vendedor normalmente es afecto, así que suponerlo exento
// subdeclararía IVA realmente recuperable.
export function decidirExencionCargos(
  sumaItems: number,
  sumaCargos: number,
  interpretacion: InterpretacionPrecio,
  ivaImpreso: number | null | undefined
): boolean {
  if (sumaCargos <= 0) return false
  if (typeof ivaImpreso !== 'number' || ivaImpreso <= 0) return false

  const tol = tolerancia(ivaImpreso)
  const ivaSiGravado = calcularNetoBruto(sumaItems + sumaCargos, interpretacion).iva
  if (Math.abs(ivaSiGravado - ivaImpreso) <= tol) return false

  const ivaSiExento = calcularNetoBruto(sumaItems, interpretacion).iva
  return Math.abs(ivaSiExento - ivaImpreso) <= tol
}

// Orquestador: reconcilia descuentos Y decide bruto/neto en un solo paso,
// porque son interdependientes — los subtotales impresos pueden estar en
// escala bruto (cuadran contra el total) o neto (cuadran contra
// total − IVA − otros impuestos), y los descuentos impresos viven en la misma
// escala que los ítems. Prueba ambas escalas con las cifras IMPRESAS:
//  - bruto: objetivo = total
//  - neto:  objetivo = total − iva_impreso − otros_impuestos (solo si hay IVA
//    impreso — dato real, no una suposición del 19%)
// Si ninguna cuadra, cae al juicio textual de la IA (validando con ×1.19
// aproximado para neto) y por último al default bruto — misma jerarquía de
// señales de determinarInterpretacionConIva, ahora con descuentos integrados.
export function reconciliarYDeterminarInterpretacion<T extends {
  descripcion: string
  subtotal: number
  descuento_monto?: number | null
  descuento_descripcion?: string | null
}>(
  items: T[],
  descuentos: DescuentoImpreso[],
  total: number,
  ivaImpreso: number | null | undefined,
  otrosImpuestos: number | null | undefined,
  interpretacionTextoIA?: InterpretacionPrecio,
  cargos: CargoImpreso[] = []
): ResultadoReconciliacionCompleta<T> {
  // La escala se detecta igual con o sin cargos: si el flete es exento, su
  // monto aparece idéntico en el total y en el neto objetivo (total − IVA), así
  // que se cancela solo y no distorsiona la comparación.
  const finalizar = (
    rec: ResultadoReconciliacion<T>,
    interpretacion: InterpretacionPrecio,
    fuente: FuenteInterpretacion
  ): ResultadoReconciliacionCompleta<T> => {
    const sumaItems = rec.items.reduce((acc, i) => acc + (i.subtotal ?? 0), 0)
    const sumaCargos = rec.cargosAplicados.reduce((acc, c) => acc + (c.monto ?? 0), 0)
    return {
      ...rec,
      interpretacion,
      fuente,
      cargosExentos: decidirExencionCargos(sumaItems, sumaCargos, interpretacion, ivaImpreso),
    }
  }

  const recBruto = reconciliarBoleta(items, descuentos, total, cargos)
  const netoObjetivo = typeof ivaImpreso === 'number' && ivaImpreso > 0
    ? total - ivaImpreso - (otrosImpuestos ?? 0)
    : null
  const recNeto = netoObjetivo != null ? reconciliarBoleta(items, descuentos, netoObjetivo, cargos) : null

  if (recBruto.cruce_valido && recNeto?.cruce_valido) {
    // Ambigüedad rara (IVA chico, totales casi iguales): menor diferencia
    // gana; empate → bruto (el default conservador de todo el sistema).
    if (recNeto.diferencia < recBruto.diferencia) return finalizar(recNeto, 'neto', 'iva_impreso')
    return finalizar(recBruto, 'bruto', 'iva_impreso')
  }
  if (recNeto?.cruce_valido) return finalizar(recNeto, 'neto', 'iva_impreso')
  if (recBruto.cruce_valido) {
    return finalizar(recBruto, 'bruto', netoObjetivo != null ? 'iva_impreso' : 'cuadre_total')
  }

  // Nada cuadró con cifras impresas — juicio textual de la IA como respaldo.
  if (interpretacionTextoIA === 'neto') {
    // Sin IVA impreso el neto objetivo solo puede aproximarse con el 19%.
    const recNetoAprox = reconciliarBoleta(items, descuentos, Math.round(total / FACTOR_IVA), cargos)
    return finalizar(recNetoAprox, 'neto', 'texto_ia')
  }
  if (interpretacionTextoIA === 'bruto') {
    return finalizar(recBruto, 'bruto', 'texto_ia')
  }

  return finalizar(recBruto, 'bruto', 'default_bruto')
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
