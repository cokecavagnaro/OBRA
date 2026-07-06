import type { Gasto, ItemGasto } from './types'

const KEY_GASTOS = 'hormigasto_gastos'

export function getGastosStorage(): Gasto[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY_GASTOS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function guardarGasto(gasto: Gasto) {
  const gastos = getGastosStorage()
  gastos.push(gasto)
  localStorage.setItem(KEY_GASTOS, JSON.stringify(gastos))
}

export function getGastosByObra(obraId: string): Gasto[] {
  return getGastosStorage().filter((g) => g.obra_id === obraId)
}

export function buildGasto(params: {
  obra_id: string
  proveedor: string
  rut: string
  fecha: string
  total: number
  contexto_boleta: string
  imagen_url?: string
  items: Array<{
    descripcion: string
    cantidad: number
    unidad: string
    precio_unitario: number
    subtotal: number
    categoria: string
    etiquetas: string[]
    confianza: number
    etapa_id?: string
    partida_id?: string
  }>
}): Gasto {
  const id = `g_${Date.now()}`
  const now = new Date().toISOString()

  const items: ItemGasto[] = params.items.map((item, idx) => ({
    id: `item_${Date.now()}_${idx}`,
    gasto_id: id,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    unidad: item.unidad,
    precio_unitario: item.precio_unitario,
    subtotal: item.subtotal,
    categoria: item.categoria,
    etiquetas: item.etiquetas,
    confianza_ia: item.confianza,
    etapa_id: item.etapa_id ?? '',
    partida_id: item.partida_id ?? '',
    estado: item.etiquetas.length > 0 ? 'confirmado' : 'pendiente',
    created_at: now,
  }))

  return {
    id,
    obra_id: params.obra_id,
    etapa_id: '',
    partida_id: '',
    proveedor: params.proveedor || 'Sin proveedor',
    rut_proveedor: params.rut || '',
    fecha_boleta: params.fecha || now.split('T')[0],
    moneda: 'CLP',
    total: params.total || items.reduce((s, i) => s + i.subtotal, 0),
    imagen_url: params.imagen_url ?? '',
    contexto_boleta: params.contexto_boleta,
    created_by: 'usuario',
    estado: items.every((i) => i.estado === 'confirmado') ? 'confirmado' : 'pendiente',
    created_at: now,
    items,
  }
}
