import { describe, it, expect } from 'vitest'
import { etiquetasAutomaticas } from '@/lib/etiquetasAutomaticas'

describe('etiquetasAutomaticas', () => {
  it('no toca un ítem que ya tiene etiquetas', () => {
    expect(etiquetasAutomaticas({ categoria: 'Pinturas', etiquetas: ['pintura', 'látex'] })).toEqual(['pintura', 'látex'])
  })

  it('usa la categoría en minúsculas para un ítem sin etiquetas', () => {
    expect(etiquetasAutomaticas({ categoria: 'Herramientas', etiquetas: [] })).toEqual(['herramientas'])
    expect(etiquetasAutomaticas({ categoria: '  Gasfitería ', etiquetas: [] })).toEqual(['gasfitería'])
  })

  it('cae en "varios" si la categoría no sirve', () => {
    expect(etiquetasAutomaticas({ categoria: 'Sin clasificar', etiquetas: [] })).toEqual(['varios'])
    expect(etiquetasAutomaticas({ categoria: '', etiquetas: [] })).toEqual(['varios'])
  })
})
