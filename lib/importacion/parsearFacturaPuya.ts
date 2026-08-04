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

  const items: ItemFacturaPuya[] = []
  const itemRegex = /\[([A-Z0-9-]+)\]\s+(.+?)\s+([\d,]+)\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)/g
  let m: RegExpExecArray | null
  while ((m = itemRegex.exec(texto)) !== null) {
    const [, codigo, descripcionCruda, cantidadTxt, precioTxt, subtotalTxt] = m
    items.push({
      codigo,
      descripcion: canonicalizarDescripcion(descripcionCruda),
      cantidad: parsearNumero(cantidadTxt) ?? 0,
      precio_unitario: parsearMontoCLP(precioTxt) ?? 0,
      subtotal: parsearMontoCLP(subtotalTxt) ?? 0,
    })
  }
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
