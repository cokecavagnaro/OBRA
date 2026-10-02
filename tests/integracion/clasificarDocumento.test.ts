import { describe, it, expect, vi, beforeEach } from 'vitest'

const { crear } = vi.hoisted(() => ({ crear: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: crear } } }))

import { clasificarDocumento } from '@/lib/clasificarDocumento'

const responder = (json: unknown) => crear.mockResolvedValue({ content: [{ type: 'text', text: 'Aquí va:\n```json\n' + JSON.stringify(json) + '\n```' }] })

describe('clasificarDocumento (con la IA simulada)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lee una transferencia que entra: texto con coma y puntos de miles queda en pesos', async () => {
    responder({ tipo: 'ingreso', confianza: 0.97, remitente: 'Inversiones Rojas SpA', cuenta_destino: 'Cuenta Vista ···4821', monto: '$6.000.000', fecha: '2026-09-12' })
    const r = await clasificarDocumento('eA==', 'image/jpeg')
    expect(r).toEqual({ tipo: 'ingreso', confianza: 0.97, ingreso: { remitente: 'Inversiones Rojas SpA', cuenta_destino: 'Cuenta Vista ···4821', monto: 6_000_000, fecha: '2026-09-12' } })
  })

  it('una boleta sale como gasto', async () => {
    responder({ tipo: 'gasto', confianza: 0.99, remitente: '', cuenta_destino: '', monto: null, fecha: '' })
    expect(await clasificarDocumento('eA==', 'image/jpeg')).toEqual({ tipo: 'gasto', confianza: 0.99 })
  })

  it('manda la imagen o el PDF con el tipo de contenido correcto', async () => {
    responder({ tipo: 'gasto', confianza: 1 })
    await clasificarDocumento('eA==', 'application/pdf')
    expect(crear.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: 'document' })
    await clasificarDocumento('eA==', 'image/png')
    expect(crear.mock.calls[1][0].messages[0].content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/png' } })
  })

  it('una respuesta que no es JSON lanza error (la ruta lo absorbe y sigue como boleta)', async () => {
    crear.mockResolvedValue({ content: [{ type: 'text', text: 'no sé' }] })
    await expect(clasificarDocumento('eA==', 'image/jpeg')).rejects.toThrow()
  })
})
