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

// Texto real capturado con pdf-parse v2 contra la factura FAC 0033080 (2025,
// emitida a nombre de la razón social anterior del mismo cliente/RUT). El PDF
// imprime la marca del producto dos veces: una vez tras el "|" en la misma
// línea del código, y otra vez sola en la línea siguiente antes de la
// cantidad — el ítem queda partido en dos líneas de texto.
const TEXTO_FAC_0033080 = `Fecha: 20/03/2025
Cliente: INMOBILIARIA Y CONSTRUCTORA LOS LEONES
SPA
RUT: 78051069-2
Dirección: los ciruelos 1886 lt 2a Navidad lo barnechea 13
Chile
Fecha de vencimiento: 20/03/2025
Condiciones de Pago:
Giro: constructora
Descripción 	Cantidad 	Precio IVA Inc. 	Subtotal IVA Inc.
[CYMMPO-00001] MORTERO HORMIGON H-20 25 kg | WEBER
WEBER
8,00 	$ 3.110 	$ 24.880
Total Neto 	$ 20.908
IVA 19% 	$ 3.972
Total 	$ 24.880
Pagado el 20/03/2025 usando Tarjetas 	$ 24.880
Importe adeudado 	$ 0
Timbre Electrónico SII
Resolución Nº: 80 de Fecha: 22/08/2014
Verifique documento en www.sii.cl
No se aceptan devoluciones de maderas, cementicios o adhesivos en polvo y productos a pedido.
COMERCIAL COSTA SUR SPA
Venta de materiales de construcción
Camino a Pupuya S/N, Navidad - Navidad - del Libertador Gral. Bernardo
O'Higgins - Chile
RUT: 77.482.149-K
FACTURA ELECTRÓNICA
Nº: 33080
San Antonio
Página: 1/1
`

describe('parsearTextoFactura — ítem partido en dos líneas', () => {
  it('extrae el ítem aunque la marca del producto se repita en una línea separada', () => {
    const factura = parsearTextoFactura(TEXTO_FAC_0033080, '33080')

    expect(factura.items).toHaveLength(1)
    expect(factura.items[0]).toEqual({
      codigo: 'CYMMPO-00001',
      descripcion: 'MORTERO HORMIGON H-20 25 kg | WEBER\nWEBER',
      cantidad: 8,
      precio_unitario: 3110,
      subtotal: 24880,
    })
    expect(factura.total).toBe(24880)
  })
})

// Texto real (recortado) de la factura 55314: varios ítems no traen código
// de producto entre corchetes en absoluto (el PDF simplemente no lo imprime
// para esta factura). Uno de ellos además tiene un "[100]" y otro un
// "[PN20]" en medio de la descripción — no son códigos de producto, son
// parte del texto ("empaque de 100 unidades", "cañería PN20") y no deben
// tratarse como tales porque no abren la descripción.
const TEXTO_FAC_0055314_ITEMS = `Fecha: 17/06/2026
Cliente: INMOBILIARIA Y CONSTRUCTORA LOS LEONES
SPA
RUT: 78051069-2
Dirección: los ciruelos 1886 lt 2a Navidad lo barnechea 13
Chile
Fecha de vencimiento: 17/06/2026
Condiciones de Pago:
Giro: constructora
Descripción 	Cantidad 	Precio IVA Inc. 	Subtotal IVA Inc.
AUTOPERFORANTE HEX. C/GOL + EPDM ZN 1/4-14 2 1/2 [100] | Mamut 	1,00 	$ 7.170 	$ 7.170
TUBO PPR [PN20] 32x6000 mm 	2,00 	$ 7.470 	$ 14.940
Total Neto 	$ 33.454
IVA 19% 	$ 6.356
Total 	$ 39.810
Pagado el 17/06/2026 	$ 39.810
Importe adeudado 	$ 0
COMERCIAL COSTA SUR SPA
Venta de materiales de construcción
Camino a Pupuya S/N, Navidad - Navidad - del Libertador Gral. Bernardo
O'Higgins - Chile
RUT: 77.482.149-K
FACTURA ELECTRÓNICA
Nº: 55314
San Antonio
Página: 1/1
`

describe('parsearTextoFactura — ítems sin código de producto', () => {
  it('usa la descripción completa como código cuando el PDF no imprime ninguno, y no confunde corchetes internos con un código', () => {
    const factura = parsearTextoFactura(TEXTO_FAC_0055314_ITEMS, '55314')

    expect(factura.items).toHaveLength(2)
    expect(factura.items[0]).toEqual({
      codigo: 'AUTOPERFORANTE HEX. C/GOL + EPDM ZN 1/4-14 2 1/2 [100] | Mamut',
      descripcion: 'AUTOPERFORANTE HEX. C/GOL + EPDM ZN 1/4-14 2 1/2 [100] | Mamut',
      cantidad: 1,
      precio_unitario: 7170,
      subtotal: 7170,
    })
    expect(factura.items[1]).toEqual({
      codigo: 'TUBO PPR [PN20] 32x6000 mm',
      descripcion: 'TUBO PPR [PN20] 32x6000 mm',
      cantidad: 2,
      precio_unitario: 7470,
      subtotal: 14940,
    })
    expect(factura.total).toBe(39810)
  })
})

// Texto real (recortado) de la factura 47004: junto a los productos
// comprados aparecen "Retiro en Sucursal Puya" y, en otras facturas,
// "Entrega Navidad" — la nota del método de despacho que imprime Puya
// Centro, siempre a $0. No son productos comprados (a diferencia de
// "Despacho", que sí puede tener costo) y no deben quedar como un ítem más
// a etiquetar.
const TEXTO_FAC_0047004_LOGISTICA_SIN_COSTO = `Fecha: 24/06/2026
Cliente: Santiago Leon
RUT: 78051069-2
Dirección: BAJO EL AZUL 801 Navidad PUPUYA 06
Fecha de vencimiento: 24/06/2026
Giro: constructora
Descripción 	Cantidad 	Precio IVA Inc. 	Subtotal IVA Inc.
[GYAKA-4604] KIT INSTALACION WC 	1,00 	$ 8.190 	$ 8.190
Retiro en Sucursal Puya 	1,00 	$ 0 	$ 0
Total Neto 	$ 6.882
IVA 19% 	$ 1.308
Total 	$ 8.190
Pagado el 24/06/2026 	$ 8.190
Importe adeudado 	$ 0
COMERCIAL COSTA SUR SPA
Venta de materiales de construcción
Camino a Pupuya S/N, Navidad - Navidad - del Libertador Gral. Bernardo
O'Higgins - Chile
RUT: 77.482.149-K
FACTURA ELECTRÓNICA
Nº: 47004
San Antonio
Página: 1/1
`

describe('parsearTextoFactura — descarta la nota de método de despacho', () => {
  it('no incluye "Retiro en Sucursal Puya" como ítem', () => {
    const factura = parsearTextoFactura(TEXTO_FAC_0047004_LOGISTICA_SIN_COSTO, '47004')

    expect(factura.items).toHaveLength(1)
    expect(factura.items[0].codigo).toBe('GYAKA-4604')
  })

  it('no descarta "Despacho" aunque coincida en $0 (sí puede tener costo en otras facturas)', () => {
    const texto = TEXTO_FAC_0047004_LOGISTICA_SIN_COSTO.replace(
      'Retiro en Sucursal Puya \t1,00 \t$ 0 \t$ 0',
      '[TRADES-000] DESPACHO N°0 **No incluye descarga \t1,00 \t$ 0 \t$ 0'
    )
    const factura = parsearTextoFactura(texto, '47004')

    expect(factura.items).toHaveLength(2)
    expect(factura.items[1].descripcion).toBe('Despacho')
  })
})

// Texto real (recortado) de la factura 46112, a caballo entre sus dos
// páginas. El código de producto puede tener guion bajo además de guion
// (CYABZ_0004) — el charclass original [A-Z0-9-] no lo reconocía y el ítem
// se perdía en silencio. Además, entre el último ítem de la página 1 y el
// primero de la página 2 se intercala el pie de página + separador
// "-- 1 of 2 --" + encabezado de columnas repetido: ese relleno no debe
// pegarse a la descripción del ítem que sigue.
const TEXTO_FAC_0046112_SALTO_PAGINA = `Fecha: 09/06/2026
Cliente: Santiago Leon
RUT: 78051069-2
Dirección: BAJO EL AZUL 801 Navidad PUPUYA 06
Fecha de vencimiento: 09/06/2026
Giro: constructora
Descripción 	Cantidad 	Precio IVA Inc. 	Subtotal IVA Inc.
[CYABZ_0004] BISAGRA ZINCADA TRADICIONAL 3 1/2x3 in | DEVA 	1,00 	$ 1.350 	$ 1.350
[METEV-3485] ENCHUFE VOLANTE HEMBRA PESADO 16 A 	1,00 	$ 1.880 	$ 1.880
COMERCIAL COSTA SUR SPA
Venta de materiales de construcción
Camino a Pupuya S/N, Navidad - Navidad - del Libertador Gral. Bernardo
O'Higgins - Chile
RUT: 77.482.149-K
FACTURA ELECTRÓNICA
Nº: 46112
San Antonio
Página: 1/2

-- 1 of 2 --

[METCE-6135] CABLE EVA 100 m #2.5 Blanco 	1,00 	$ 44.800 	$ 44.800
Total Neto 	$ 48.030
IVA 19% 	$ 9.126
Total 	$ 57.156
Pagado el 09/06/2026 	$ 57.156
Importe adeudado 	$ 0
COMERCIAL COSTA SUR SPA
Venta de materiales de construcción
Camino a Pupuya S/N, Navidad - Navidad - del Libertador Gral. Bernardo
O'Higgins - Chile
RUT: 77.482.149-K
FACTURA ELECTRÓNICA
Nº: 46112
San Antonio
Página: 1/1
`

describe('parsearTextoFactura — código con guion bajo y salto de página', () => {
  it('reconoce códigos con guion bajo y no arrastra el pie de página al ítem siguiente', () => {
    const factura = parsearTextoFactura(TEXTO_FAC_0046112_SALTO_PAGINA, '46112')

    expect(factura.items).toHaveLength(3)
    expect(factura.items[0].codigo).toBe('CYABZ_0004')
    expect(factura.items[2]).toEqual({
      codigo: 'METCE-6135',
      descripcion: 'CABLE EVA 100 m #2.5 Blanco',
      cantidad: 1,
      precio_unitario: 44800,
      subtotal: 44800,
    })
    expect(factura.total).toBe(57156)
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
