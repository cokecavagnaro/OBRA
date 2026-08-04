import { describe, it, expect } from 'vitest'
import { construirUrlPdf } from '../../scripts/importar-puyacentro/descargarFacturas'

describe('construirUrlPdf', () => {
  it('arma la URL de descarga directa del PDF con el access_token', () => {
    const url = construirUrlPdf('739349', '10e841f2-b648-4537-8e32-fd63c7171000')
    expect(url).toBe(
      'https://www.puyacentro.cl/my/invoices/739349?access_token=10e841f2-b648-4537-8e32-fd63c7171000&report_type=pdf&download=true'
    )
  })
})
