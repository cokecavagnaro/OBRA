import type { FacturaPuya, ItemFacturaPuya } from './parsearFacturaPuya'

export interface ItemConEtiquetas extends ItemFacturaPuya {
  categoria: string
  etiquetas: string[]
}

export interface FacturaConEtiquetas extends Omit<FacturaPuya, 'items'> {
  items: ItemConEtiquetas[]
}

// Falla fuerte (no asigna un default silencioso) si aparece un código de
// producto sin etiqueta: mejor frenar la importación que guardar un ítem
// sin clasificar por un olvido en etiquetas.json.
export function aplicarEtiquetas(
  facturas: FacturaPuya[],
  mapa: Record<string, { categoria: string; etiquetas: string[] }>
): FacturaConEtiquetas[] {
  return facturas.map((factura) => ({
    ...factura,
    items: factura.items.map((item) => {
      const clasificacion = mapa[item.codigo]
      if (!clasificacion) {
        throw new Error(`Sin etiqueta asignada para el código de producto ${item.codigo} (factura ${factura.numero})`)
      }
      return { ...item, categoria: clasificacion.categoria, etiquetas: clasificacion.etiquetas }
    }),
  }))
}
