import { describe, it, expect } from 'vitest'
import { interpretarClasificacion } from '@/lib/clasificarDocumento'

describe('interpretarClasificacion', () => {
  it('acepta un ingreso con monto legible y lo parsea como pesos', () => {
    const r = interpretarClasificacion({
      tipo: 'ingreso',
      confianza: 0.96,
      remitente: ' Inversiones Rojas SpA ',
      cuenta_destino: 'Cuenta Vista ···4821',
      monto: '$6.000.000',
      fecha: '2026-09-12',
    })
    expect(r.tipo).toBe('ingreso')
    expect(r.ingreso).toEqual({ remitente: 'Inversiones Rojas SpA', cuenta_destino: 'Cuenta Vista ···4821', monto: 6000000, fecha: '2026-09-12' })
  })

  it('un "ingreso" sin monto legible se trata como gasto (más seguro)', () => {
    expect(interpretarClasificacion({ tipo: 'ingreso', confianza: 0.9, monto: null }).tipo).toBe('gasto')
    expect(interpretarClasificacion({ tipo: 'ingreso', confianza: 0.9, monto: '0' }).tipo).toBe('gasto')
  })

  it('una boleta se clasifica como gasto y no trae datos de ingreso', () => {
    const r = interpretarClasificacion({ tipo: 'gasto', confianza: 0.99 })
    expect(r).toEqual({ tipo: 'gasto', confianza: 0.99 })
  })

  it('acota la confianza al rango 0-1 y tolera datos faltantes', () => {
    expect(interpretarClasificacion({ tipo: 'gasto', confianza: 7 }).confianza).toBe(1)
    expect(interpretarClasificacion({ tipo: 'gasto' }).confianza).toBe(0)
    const r = interpretarClasificacion({ tipo: 'ingreso', monto: '5000' })
    expect(r.ingreso).toEqual({ remitente: '', cuenta_destino: '', monto: 5000, fecha: '' })
  })
})
