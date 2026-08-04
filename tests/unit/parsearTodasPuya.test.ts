import { describe, it, expect } from 'vitest'
import { agruparProductosUnicos } from '../../scripts/importar-puyacentro/parsearTodas'
import type { FacturaPuya } from '../../lib/importacion/parsearFacturaPuya'

function facturaDeEjemplo(overrides: Partial<FacturaPuya> = {}): FacturaPuya {
  return {
    numero: '1',
    fecha: '2026-01-01',
    clienteNombre: 'Santiago Leon',
    clienteRut: '78051069-2',
    proveedor: 'COMERCIAL COSTA SUR SPA',
    rutProveedor: '77.482.149-K',
    items: [],
    totalNeto: 0,
    iva: 0,
    total: 0,
    importeAdeudado: 0,
    ...overrides,
  }
}

describe('agruparProductosUnicos', () => {
  it('cuenta cuántas veces aparece cada código de producto entre varias facturas', () => {
    const facturas: FacturaPuya[] = [
      facturaDeEjemplo({
        numero: '1',
        items: [
          { codigo: 'EYFEAT-0043', descripcion: 'Estanque', cantidad: 1, precio_unitario: 100, subtotal: 100 },
          { codigo: 'TRADES-003', descripcion: 'Despacho', cantidad: 1, precio_unitario: 10, subtotal: 10 },
        ],
      }),
      facturaDeEjemplo({
        numero: '2',
        items: [
          { codigo: 'TRADES-003', descripcion: 'Despacho', cantidad: 1, precio_unitario: 10, subtotal: 10 },
        ],
      }),
    ]

    const productos = agruparProductosUnicos(facturas)

    expect(productos).toEqual([
      { codigo: 'TRADES-003', descripcion: 'Despacho', apariciones: 2 },
      { codigo: 'EYFEAT-0043', descripcion: 'Estanque', apariciones: 1 },
    ])
  })
})
