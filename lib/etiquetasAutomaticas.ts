import type { ItemAnalizado } from './types'

// Etiquetas que el sistema pone solo cuando la persona decide guardar la
// boleta sin etiquetar ítem por ítem. Solo se usa para los ítems que llegaron
// SIN etiquetas (los que la IA ya etiquetó, o que la persona etiquetó, no se
// tocan). Se parte de la categoría que la IA leyó, que es lo único confiable
// que hay para un ítem así; si no sirve ("Sin clasificar" o vacía), "varios".
export const ETIQUETA_GENERICA = 'varios'

export function etiquetasAutomaticas(item: Pick<ItemAnalizado, 'categoria' | 'etiquetas'>): string[] {
  if (item.etiquetas.length > 0) return item.etiquetas
  const categoria = (item.categoria ?? '').toLowerCase().trim()
  if (!categoria || categoria === 'sin clasificar') return [ETIQUETA_GENERICA]
  return [categoria]
}
