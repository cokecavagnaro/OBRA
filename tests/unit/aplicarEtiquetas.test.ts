import { describe, it, expect } from 'vitest'
import { aplicarEtiquetas } from '@/lib/importacion/aplicarEtiquetas'
import type { FacturaPuya } from '@/lib/importacion/parsearFacturaPuya'

function facturaDeEjemplo(): FacturaPuya {
  return {
    numero: '57242',
    fecha: '2026-08-01',
    clienteNombre: 'Santiago Leon',
    clienteRut: '78051069-2',
    proveedor: 'COMERCIAL COSTA SUR SPA',
    rutProveedor: '77.482.149-K',
    items: [
      { codigo: 'EYFEAT-0043', descripcion: 'Estanque', cantidad: 1, precio_unitario: 268600, subtotal: 268600 },
      { codigo: 'TRADES-003', descripcion: 'Despacho', cantidad: 1, precio_unitario: 10000, subtotal: 10000 },
    ],
    totalNeto: 234117,
    iva: 44483,
    total: 278600,
    importeAdeudado: 0,
  }
}

describe('aplicarEtiquetas', () => {
  it('agrega categoría y etiquetas a cada ítem según su código de producto', () => {
    const mapa = {
      'EYFEAT-0043': { categoria: 'Materiales', etiquetas: ['estanque'] },
      'TRADES-003': { categoria: 'Despacho', etiquetas: ['despacho'] },
    }

    const [factura] = aplicarEtiquetas([facturaDeEjemplo()], mapa)

    expect(factura.items[0]).toMatchObject({ codigo: 'EYFEAT-0043', categoria: 'Materiales', etiquetas: ['estanque'] })
    expect(factura.items[1]).toMatchObject({ codigo: 'TRADES-003', categoria: 'Despacho', etiquetas: ['despacho'] })
  })

  it('lanza error si un código de producto no tiene etiqueta asignada', () => {
    const mapa = { 'EYFEAT-0043': { categoria: 'Materiales', etiquetas: ['estanque'] } }
    expect(() => aplicarEtiquetas([facturaDeEjemplo()], mapa)).toThrow(/TRADES-003/)
  })
})
