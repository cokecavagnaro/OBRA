import { describe, it, expect } from 'vitest'
import { parsearTextoFactura, canonicalizarDescripcion } from '@/lib/importacion/parsearFacturaPuya'

// Texto real capturado con pdf-parse v2 contra la factura FAC 0057242
// descargada de Puya Centro (scripts/importar-puyacentro/muestras/).
const TEXTO_FAC_0057242 = `Fecha: 01/08/2026
Cliente: Santiago Leon
RUT: 78051069-2
Dirección: BAJO EL AZUL 801 Navidad PUPUYA 06
3230000 Chile
Fecha de vencimiento: 01/08/2026
Condiciones de Pago: Paga después
Dirección de Entrega: Condominio La Quila
Giro: constructora
Descripción 	Cantidad 	Precio IVA Inc. 	Subtotal IVA Inc.
[EYFEAT-0043] ESTANQUE VERTICAL 3400 LTS | MATRIPLAST 	1,00 	$ 268.600 	$ 268.600
[TRADES-003] DESPACHO N°3 **No incluye descarga 	1,00 	$ 10.000 	$ 10.000
Total Neto 	$ 234.117
IVA 19% 	$ 44.483
Total 	$ 278.600
Pagado el 01/08/2026 	$ 278.600
Importe adeudado 	$ 0
Timbre Electrónico SII
Resolución Nº: 80 de Fecha: 22/08/2014
Verifique documento en www.sii.cl
No se aceptan devoluciones de maderas, cementicios o adhesivos en polvo, cortes a medida y productos a pedido.
COMERCIAL COSTA SUR SPA
Venta de materiales de construcción
Camino a Pupuya S/N, Navidad - Navidad - del Libertador Gral. Bernardo
O'Higgins - Chile
RUT: 77.482.149-K
FACTURA ELECTRÓNICA
Nº: 57242
San Antonio
Página: 1/1

-- 1 of 1 --
`

describe('parsearTextoFactura', () => {
  it('extrae cabecera, ítems y totales de una factura real de Puya Centro', () => {
    const factura = parsearTextoFactura(TEXTO_FAC_0057242, '57242')

    expect(factura.numero).toBe('57242')
    expect(factura.fecha).toBe('2026-08-01')
    expect(factura.clienteNombre).toBe('Santiago Leon')
    expect(factura.clienteRut).toBe('78051069-2')
    expect(factura.proveedor).toBe('COMERCIAL COSTA SUR SPA')
    expect(factura.rutProveedor).toBe('77.482.149-K')

    expect(factura.items).toHaveLength(2)
    expect(factura.items[0]).toEqual({
      codigo: 'EYFEAT-0043',
      descripcion: 'ESTANQUE VERTICAL 3400 LTS | MATRIPLAST',
      cantidad: 1,
      precio_unitario: 268600,
      subtotal: 268600,
    })
    expect(factura.items[1]).toEqual({
      codigo: 'TRADES-003',
      descripcion: 'Despacho',
      cantidad: 1,
      precio_unitario: 10000,
      subtotal: 10000,
    })

    expect(factura.totalNeto).toBe(234117)
    expect(factura.iva).toBe(44483)
    expect(factura.total).toBe(278600)
    expect(factura.importeAdeudado).toBe(0)
  })

  it('lanza error si el número esperado no coincide con el del PDF', () => {
    expect(() => parsearTextoFactura(TEXTO_FAC_0057242, '99999')).toThrow(/no coincide/)
  })

  it('lanza error si no encuentra ningún ítem', () => {
    expect(() => parsearTextoFactura('texto sin nada útil')).toThrow()
  })
})

describe('canonicalizarDescripcion', () => {
  it('quita el número de pedido de las líneas de despacho', () => {
    expect(canonicalizarDescripcion('DESPACHO N°3 **No incluye descarga')).toBe('Despacho')
    expect(canonicalizarDescripcion('DESPACHO N°15')).toBe('Despacho')
  })

  it('deja intacta la descripción de un producto normal', () => {
    expect(canonicalizarDescripcion('ESTANQUE VERTICAL 3400 LTS | MATRIPLAST')).toBe(
      'ESTANQUE VERTICAL 3400 LTS | MATRIPLAST'
    )
  })
})
