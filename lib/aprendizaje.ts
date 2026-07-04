import type { ClasificacionAprendida, ItemAnalizado } from './types'

const MAX_CONTEXTO = 30

export function normalizarDescripcion(descripcion: string): string {
  return descripcion.toLowerCase().trim().replace(/\s+/g, ' ')
}

export function buildContextoAprendizaje(aprendidas: ClasificacionAprendida[]): string {
  if (aprendidas.length === 0) return ''

  const recientes = [...aprendidas]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, MAX_CONTEXTO)

  const lineas = recientes.map(
    (c) => `- "${c.descripcion_normalizada}" → categoría: ${c.categoria}, etiquetas: [${c.etiquetas.join(', ')}]`
  )

  return `Clasificaciones previas aprobadas en esta obra:\n${lineas.join('\n')}`
}

export function aplicarAprendizajeDeterministico(
  items: ItemAnalizado[],
  aprendidas: ClasificacionAprendida[]
): ItemAnalizado[] {
  if (aprendidas.length === 0) return items

  const porDescripcion = new Map(aprendidas.map((c) => [c.descripcion_normalizada, c]))

  return items.map((item) => {
    const match = porDescripcion.get(normalizarDescripcion(item.descripcion))
    if (!match) return item
    return { ...item, categoria: match.categoria, etiquetas: match.etiquetas, confianza: 1 }
  })
}
