import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { clasificarDocumento, analizarBoletaImagen } = vi.hoisted(() => ({ clasificarDocumento: vi.fn(), analizarBoletaImagen: vi.fn() }))
vi.mock('@/lib/clasificarDocumento', () => ({ clasificarDocumento }))
vi.mock('@/lib/analizarBoleta', () => ({ analizarBoletaImagen }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) }),
}))

import { POST } from '@/app/api/analizar-boleta/route'

const pedir = (cuerpo: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/analizar-boleta', { method: 'POST', body: JSON.stringify(cuerpo) }))

const base = { imagen_base64: 'eA==', media_type: 'image/jpeg', proyecto_id: 'p1' }

describe('POST /api/analizar-boleta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    analizarBoletaImagen.mockResolvedValue({ proveedor: 'Sodimac', total: 1000, items: [] })
  })

  it('si la IA reconoce un ingreso, devuelve el ingreso y NO lee ítems de boleta', async () => {
    clasificarDocumento.mockResolvedValue({ tipo: 'ingreso', confianza: 0.95, ingreso: { remitente: 'Cliente', cuenta_destino: '···1', monto: 5000, fecha: '2026-09-01' } })
    const res = await pedir(base)
    expect(await res.json()).toEqual({ tipo: 'ingreso', confianza: 0.95, ingreso: { remitente: 'Cliente', cuenta_destino: '···1', monto: 5000, fecha: '2026-09-01' } })
    expect(analizarBoletaImagen).not.toHaveBeenCalled()
  })

  it('si es un gasto, sigue el análisis de boleta de siempre y marca tipo "gasto"', async () => {
    clasificarDocumento.mockResolvedValue({ tipo: 'gasto', confianza: 0.9 })
    const res = await pedir(base)
    expect(await res.json()).toEqual({ proveedor: 'Sodimac', total: 1000, items: [], tipo: 'gasto' })
    expect(analizarBoletaImagen).toHaveBeenCalledTimes(1)
  })

  it('con solo_gasto (re-escaneo) ni siquiera consulta la clasificación', async () => {
    const res = await pedir({ ...base, solo_gasto: true })
    expect((await res.json()).tipo).toBe('gasto')
    expect(clasificarDocumento).not.toHaveBeenCalled()
  })

  it('si la clasificación falla, no se pierde el escaneo: se sigue como boleta', async () => {
    clasificarDocumento.mockRejectedValue(new Error('IA caída'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await pedir(base)
    expect(res.status).toBe(200)
    expect((await res.json()).tipo).toBe('gasto')
    expect(analizarBoletaImagen).toHaveBeenCalledTimes(1)
  })

  it('rechaza una petición sin imagen o sin proyecto', async () => {
    expect((await pedir({ proyecto_id: 'p1' })).status).toBe(400)
    expect((await pedir({ imagen_base64: 'eA==' })).status).toBe(400)
    expect(clasificarDocumento).not.toHaveBeenCalled()
  })

  it('si el análisis de la boleta falla, responde error 500', async () => {
    clasificarDocumento.mockResolvedValue({ tipo: 'gasto', confianza: 1 })
    analizarBoletaImagen.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await pedir(base)).status).toBe(500)
  })
})
