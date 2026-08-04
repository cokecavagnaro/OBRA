// Parser determinístico del PDF de factura de Puya Centro. No usa IA: el
// PDF trae texto real (no es una foto escaneada), así que se extrae todo
// con expresiones regulares sobre ese texto. Reusa los mismos parsers de
// montos que ya usa el resto de la app (lib/montos.ts) para no duplicar la
// lógica de separadores de miles/decimales.
import { parsearNumero, parsearMontoCLP } from '@/lib/montos'

export interface ItemFacturaPuya {
  codigo: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface FacturaPuya {
  numero: string
  fecha: string
  clienteNombre: string
  clienteRut: string
  proveedor: string
  rutProveedor: string
  items: ItemFacturaPuya[]
  totalNeto: number
  iva: number
  total: number
  importeAdeudado: number
}

// Fijo: todas las facturas de esta importación vienen de la misma cuenta de
// Puya Centro / mismo emisor. Confirmado contra FAC 0057242.
const PROVEEDOR = 'COMERCIAL COSTA SUR SPA'
const RUT_PROVEEDOR = '77.482.149-K'

function fechaChileAIso(fecha: string): string {
  const m = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) throw new Error(`Fecha con formato inesperado: "${fecha}"`)
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm}-${dd}`
}

// La línea de despacho imprime el número de pedido ("DESPACHO N°3",
// "DESPACHO N°15 **No incluye descarga"), que cambia en cada factura y
// rompería el aprendizaje de etiquetas si se guardara tal cual (cada
// despacho parecería un producto distinto). Mismo criterio que
// descripcionCanonicaCargo en lib/confianzaDocumento.ts.
export function canonicalizarDescripcion(descripcion: string): string {
  const limpio = descripcion.trim()
  if (/^DESPACHO\b/i.test(limpio)) return 'Despacho'
  return limpio
}

// Líneas fijas del pie/encabezado que pdf-parse intercala en medio de la
// tabla de ítems cuando la factura ocupa más de una página (separador
// "-- N of M --" + pie de página + encabezado de columnas repetido antes de
// continuar con los ítems de la página siguiente). Ninguna de estas es parte
// de la descripción de un ítem — si se dejan en el buffer de líneas sin
// terminar, se pegan al frente de la descripción del ítem siguiente y le
// tapan el código de producto. Confirmado contra la factura 46112 (2
// páginas).
const LINEAS_RELLENO_ENTRE_PAGINAS = [
  /^COMERCIAL COSTA SUR SPA$/,
  /^Venta de materiales de construcción$/,
  /^Camino a Pupuya S\/N,/,
  /^O'Higgins - Chile$/,
  /^RUT:\s*77\.482\.149-K$/,
  /^FACTURA ELECTRÓNICA$/,
  /^Nº:\s*\d+$/,
  /^San Antonio$/,
  /^Página:\s*\d+\/\d+$/,
  /^-- \d+ of \d+ --$/,
  /^Descripción\s+Cantidad/,
]

function esLineaDeRelleno(linea: string): boolean {
  return LINEAS_RELLENO_ENTRE_PAGINAS.some((r) => r.test(linea))
}

// "Retiro en Sucursal Puya" y "Entrega <comuna>" son la nota del método de
// despacho, no un producto comprado — a diferencia de "Despacho" (que sí
// puede tener costo), estas dos líneas aparecen siempre con subtotal $0 en
// las 98 facturas de esta importación. Se excluyen del todo en vez de
// guardarlas como ítem de $0 que habría que etiquetar sin necesidad.
const DESCRIPCIONES_LOGISTICA_SIN_COSTO = [/^Retiro en Sucursal Puya$/, /^Entrega\b/]

function esLogisticaSinCosto(descripcion: string, subtotal: number): boolean {
  return subtotal === 0 && DESCRIPCIONES_LOGISTICA_SIN_COSTO.some((r) => r.test(descripcion))
}

// Una línea de ítem termina siempre en "<cantidad> $<precio> $<subtotal>".
// Todo lo que la precede en esa misma línea (si algo precede) es el final de
// la descripción; lo que venga en líneas anteriores sin ese patrón es el
// resto de la descripción, acumulado hasta encontrar esta línea.
const LINEA_ITEM_REGEX = /^(.*?)\s*([\d,]+)\s*\$\s*([\d.,]+)\s*\$\s*([\d.,]+)$/

// El código de producto solo cuenta si abre la descripción ya reconstruida
// (ej. "[EYFEAT-0043] ESTANQUE..."). Un "[100]" o "[PN20]" en medio de una
// descripción sin código real (ej. "TUBO PPR [PN20] 32x6000 mm", factura
// 55314) es parte del texto del producto, no un SKU — de tratarlo como
// código se generarían ítems fantasma con el código mal cortado.
const CODIGO_AL_INICIO_REGEX = /^\[([A-Z0-9_-]+)\]\s*([\s\S]*)$/

function extraerItems(texto: string): ItemFacturaPuya[] {
  const inicioMatch = texto.match(/Subtotal IVA Inc\.\s*/)
  if (!inicioMatch || inicioMatch.index === undefined) {
    throw new Error('No se encontró la tabla de ítems en el texto del PDF')
  }
  const inicioIdx = inicioMatch.index + inicioMatch[0].length
  const finIdx = texto.indexOf('Total Neto', inicioIdx)
  if (finIdx === -1) throw new Error('No se encontró "Total Neto" en el texto del PDF')
  const bloqueItems = texto.slice(inicioIdx, finIdx)

  const items: ItemFacturaPuya[] = []
  let buffer: string[] = []
  for (const lineaCruda of bloqueItems.split('\n')) {
    const linea = lineaCruda.trim()
    if (!linea) continue
    if (esLineaDeRelleno(linea)) {
      buffer = []
      continue
    }
    const m = linea.match(LINEA_ITEM_REGEX)
    if (!m) {
      buffer.push(linea)
      continue
    }
    const [, colaDescripcion, cantidadTxt, precioTxt, subtotalTxt] = m
    if (colaDescripcion) buffer.push(colaDescripcion)
    const descripcionCompleta = buffer.join('\n')
    buffer = []

    const codigoMatch = descripcionCompleta.match(CODIGO_AL_INICIO_REGEX)
    const codigo = codigoMatch ? codigoMatch[1] : descripcionCompleta
    const descripcionCruda = codigoMatch ? codigoMatch[2] : descripcionCompleta
    const descripcion = canonicalizarDescripcion(descripcionCruda)
    const subtotal = parsearMontoCLP(subtotalTxt) ?? 0

    if (esLogisticaSinCosto(descripcion, subtotal)) continue

    items.push({
      codigo,
      descripcion,
      cantidad: parsearNumero(cantidadTxt) ?? 0,
      precio_unitario: parsearMontoCLP(precioTxt) ?? 0,
      subtotal,
    })
  }
  return items
}

export function parsearTextoFactura(texto: string, numeroEsperado?: string): FacturaPuya {
  const numeroMatch = texto.match(/FACTURA ELECTRÓNICA\s*N[°º]:\s*(\d+)/)
  if (!numeroMatch) throw new Error('No se encontró el número de factura en el texto del PDF')
  const numero = numeroMatch[1]
  if (numeroEsperado && numero !== numeroEsperado) {
    throw new Error(`Número de factura no coincide: esperaba ${numeroEsperado}, el PDF dice ${numero}`)
  }

  const fechaMatch = texto.match(/Fecha:\s*(\d{2}\/\d{2}\/\d{4})/)
  if (!fechaMatch) throw new Error('No se encontró la fecha en el texto del PDF')

  const clienteMatch = texto.match(/Cliente:\s*([\s\S]+?)\s*RUT:/)
  if (!clienteMatch) throw new Error('No se encontró el cliente en el texto del PDF')

  const rutMatch = texto.match(/RUT:\s*([\d.]+-[\dkK])/)
  if (!rutMatch) throw new Error('No se encontró el RUT del cliente en el texto del PDF')

  const totalesMatch = texto.match(
    /Total Neto\s*\$\s*([\d.,]+)\s*IVA\s*19%\s*\$\s*([\d.,]+)\s*Total\s*\$\s*([\d.,]+)/
  )
  if (!totalesMatch) throw new Error('No se encontraron los totales (Neto/IVA/Total) en el texto del PDF')

  const adeudadoMatch = texto.match(/Importe adeudado\s*\$\s*([\d.,-]+)/)
  if (!adeudadoMatch) throw new Error('No se encontró el importe adeudado en el texto del PDF')

  const items = extraerItems(texto)
  if (items.length === 0) throw new Error('No se encontró ningún ítem en el texto del PDF')

  return {
    numero,
    fecha: fechaChileAIso(fechaMatch[1]),
    clienteNombre: clienteMatch[1].trim(),
    clienteRut: rutMatch[1],
    proveedor: PROVEEDOR,
    rutProveedor: RUT_PROVEEDOR,
    items,
    totalNeto: parsearMontoCLP(totalesMatch[1]) ?? 0,
    iva: parsearMontoCLP(totalesMatch[2]) ?? 0,
    total: parsearMontoCLP(totalesMatch[3]) ?? 0,
    importeAdeudado: parsearMontoCLP(adeudadoMatch[1]) ?? 0,
  }
}
