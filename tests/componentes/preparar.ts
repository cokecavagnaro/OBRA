import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

export { router, navegacion } from './navegacionMock'

// Valores por defecto para el módulo de base de datos mockeado: listas vacías
// y null donde se espera un registro. Cada prueba sobreescribe lo que necesite.
export function dbPorDefecto(db: Record<string, unknown>) {
  const m = (nombre: string, valor: unknown) => (db[nombre] as ReturnType<typeof vi.fn>).mockResolvedValue(valor)
  for (const n of ['getProyectos', 'getAllGastos', 'getAllIngresos', 'getGastos', 'getIngresos', 'getPermisosOverrides', 'getNotificaciones', 'getEtapas', 'getPartidas', 'getEtiquetas']) m(n, [])
  for (const n of ['getUsuarioActual', 'getCuenta', 'getGastoPorId', 'createEtapa', 'createPartida']) m(n, null)
  m('saveIngreso', { id: 'ingreso-nuevo' })
  m('saveGasto', { id: 'gasto-nuevo' })
  m('subirImagenBoleta', 'https://almacen/boleta.jpg')
  m('subirComprobanteManoDeObra', 'https://almacen/comprobante.jpg')
  m('upsertClasificacionAprendida', undefined)
  m('updateItemGasto', { ok: true, nuevoTotal: 0 })
  m('marcarNotificacionLeida', undefined)
  m('marcarTodasNotificacionesLeidas', undefined)
}

export function usuario(rol: 'admin' | 'usuario' = 'admin') {
  return { id: rol === 'admin' ? 'u-admin' : 'u-usuario', cuenta_id: 'c1', nombre: rol === 'admin' ? 'Jorge' : 'Vicente', email: `${rol}@prueba.cl`, rol, activo: true }
}

export function proyecto(id: string, nombre: string) {
  return { id, nombre, system_prompt: '', cuenta_id: 'c1', presupuesto: null, created_at: '2026-01-01' }
}

export function gasto(o: { id: string; proyecto_id: string; total: number; estado?: 'pendiente' | 'aprobado' | 'rechazado'; items?: Record<string, unknown>[]; solicitante_id?: string | null; proveedor?: string }) {
  return {
    id: o.id, proyecto_id: o.proyecto_id, proveedor: o.proveedor ?? 'Proveedor', rut_proveedor: '1-9', fecha_boleta: '2026-09-20', moneda: 'CLP', total: o.total,
    imagen_url: '', contexto_boleta: '', creado_por_email: 'x@x.cl', comentario: null, estado: 'confirmado', estado_aprobacion: o.estado ?? 'aprobado',
    solicitante_id: o.solicitante_id ?? null, aprobado_por_id: null, aprobado_por_email: null, fecha_solicitud: '2026-09-20T10:00:00Z', fecha_resolucion: null,
    motivo_rechazo: null, created_at: '2026-09-20T10:00:00Z', items: o.items ?? [], eventos: [], historial_aprobacion: [],
  }
}

export function item(id: string, o: Record<string, unknown> = {}) {
  return {
    id, gasto_id: 'g', descripcion: `Ítem ${id}`, cantidad: 1, unidad: 'un', precio_unitario: 1000, subtotal: 1000, categoria: 'Materiales',
    etiquetas: ['x'], confianza_ia: 0.9, etapa_id: '', partida_id: '', estado: 'confirmado', created_at: '2026-09-20', ...o,
  }
}
