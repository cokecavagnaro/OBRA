import { CLASIFICACIONES_CONFIRMADAS_MOCK } from './mock'
import type { ClasificacionConfirmada } from './mock'

// En producción (Supabase), esta lista vendría de la tabla items_gasto con estado='confirmado'
const clasificacionesRuntime: ClasificacionConfirmada[] = [...CLASIFICACIONES_CONFIRMADAS_MOCK]

export function agregarClasificacionConfirmada(c: ClasificacionConfirmada) {
  const existe = clasificacionesRuntime.find(
    (x) => x.obra_id === c.obra_id && x.descripcion.toLowerCase() === c.descripcion.toLowerCase()
  )
  if (existe) {
    // Actualizar etiquetas si ya existía
    existe.categoria = c.categoria
    existe.etiquetas = c.etiquetas
  } else {
    clasificacionesRuntime.push(c)
  }
}

export function buildContextoAprendizaje(obraId: string): string {
  const previas = clasificacionesRuntime.filter((c) => c.obra_id === obraId)
  if (previas.length === 0) return ''

  const lineas = previas.map(
    (c) => `- "${c.descripcion}" → categoría: ${c.categoria}, etiquetas: [${c.etiquetas.join(', ')}]`
  )

  return `Clasificaciones previas aprobadas en esta obra:\n${lineas.join('\n')}`
}
