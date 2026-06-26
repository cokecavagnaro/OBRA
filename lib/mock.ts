import type { Obra, Etapa, Partida, Gasto, ItemGasto } from './types'

// SVG placeholders por color de obra
const IMG_OBRA_1 = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="#DBEAFE"/><text x="100" y="70" text-anchor="middle" fill="#3B82F6" font-size="28">🧾</text><text x="100" y="100" text-anchor="middle" fill="#60A5FA" font-size="11">Sodimac Quilicura</text></svg>')}`
const IMG_OBRA_2 = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect width="200" height="150" fill="#D1FAE5"/><text x="100" y="70" text-anchor="middle" fill="#059669" font-size="28">🧾</text><text x="100" y="100" text-anchor="middle" fill="#34D399" font-size="11">Construmart San Bernardo</text></svg>')}`

export interface ClasificacionConfirmada {
  obra_id: string
  descripcion: string
  categoria: string
  etiquetas: string[]
}

export const CLASIFICACIONES_CONFIRMADAS_MOCK: ClasificacionConfirmada[] = [
  { obra_id: '1', descripcion: 'Pintura látex blanca 20L', categoria: 'Pinturas', etiquetas: ['pintura', 'látex', 'terminaciones'] },
  { obra_id: '1', descripcion: 'Rodillo lana 23cm', categoria: 'Herramientas', etiquetas: ['pintura', 'herramienta'] },
]

export const OBRAS_MOCK: Obra[] = [
  {
    id: '1',
    nombre: 'Casa Familia González',
    system_prompt:
      'Las maderas se usan exclusivamente para cubierta de techo. Los clavos: 1/3 se contabiliza para techo y 2/3 para piso. El hormigón siempre va a la partida Fundaciones aunque no se indique.',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    nombre: 'Proyecto Los Alpes 12',
    system_prompt:
      'Las maderas en este proyecto se destinan a tabiquería interior, no a cubierta. Los fierros corrugados siempre van a Enfierraduras. El proyecto tiene dos pisos; si no se especifica, asumir piso 1.',
    created_at: '2024-02-01T00:00:00Z',
  },
]

export const ETAPAS_MOCK: Etapa[] = [
  { id: '1', obra_id: '1', nombre: 'Fundaciones', orden: 1 },
  { id: '2', obra_id: '1', nombre: 'Estructura', orden: 2 },
  { id: '3', obra_id: '1', nombre: 'Terminaciones', orden: 3 },
  { id: '4', obra_id: '2', nombre: 'Obra Gruesa', orden: 1 },
  { id: '5', obra_id: '2', nombre: 'Terminaciones', orden: 2 },
]

export const PARTIDAS_MOCK: Partida[] = [
  { id: '1', etapa_id: '1', nombre: 'Excavaciones' },
  { id: '2', etapa_id: '1', nombre: 'Hormigón' },
  { id: '3', etapa_id: '2', nombre: 'Enfierraduras' },
  { id: '4', etapa_id: '2', nombre: 'Moldaje' },
  { id: '5', etapa_id: '3', nombre: 'Pintura' },
  { id: '6', etapa_id: '3', nombre: 'Cerámicas' },
  { id: '7', etapa_id: '4', nombre: 'Tabiquería' },
  { id: '8', etapa_id: '5', nombre: 'Pisos' },
]

export const ITEMS_MOCK: ItemGasto[] = [
  {
    id: 'i1',
    gasto_id: 'g1',
    descripcion: 'Pintura látex blanca 20L',
    cantidad: 4,
    unidad: 'un',
    precio_unitario: 28990,
    subtotal: 115960,
    categoria: 'Pinturas',
    etiquetas: ['pintura', 'látex', 'terminaciones'],
    confianza_ia: 0.95,
    estado: 'confirmado',
    created_at: '2024-06-10T10:00:00Z',
  },
  {
    id: 'i2',
    gasto_id: 'g1',
    descripcion: 'Rodillo lana 23cm',
    cantidad: 2,
    unidad: 'un',
    precio_unitario: 4990,
    subtotal: 9980,
    categoria: 'Herramientas',
    etiquetas: ['pintura', 'herramienta'],
    confianza_ia: 0.88,
    estado: 'confirmado',
    created_at: '2024-06-10T10:00:00Z',
  },
  {
    id: 'i3',
    gasto_id: 'g2',
    descripcion: 'Fierro corrugado 12mm',
    cantidad: 10,
    unidad: 'un',
    precio_unitario: 8500,
    subtotal: 85000,
    categoria: 'Enfierraduras',
    etiquetas: ['fierro', 'estructura'],
    confianza_ia: 0.55,
    estado: 'pendiente',
    created_at: '2024-06-12T09:00:00Z',
  },
  {
    id: 'i4',
    gasto_id: 'g2',
    descripcion: 'Alambre amarre kg',
    cantidad: 3,
    unidad: 'kg',
    precio_unitario: 2200,
    subtotal: 6600,
    categoria: 'Enfierraduras',
    etiquetas: ['fierro'],
    confianza_ia: 0.62,
    estado: 'pendiente',
    created_at: '2024-06-12T09:00:00Z',
  },
]

export const GASTOS_MOCK: Gasto[] = [
  {
    id: 'g1',
    obra_id: '1',
    etapa_id: '3',
    partida_id: '5',
    proveedor: 'Sodimac Quilicura',
    rut_proveedor: '96.928.180-5',
    fecha_boleta: '2024-06-10',
    moneda: 'CLP',
    total: 125940,
    imagen_url: IMG_OBRA_1,
    contexto_boleta: 'Pintura para dormitorio principal',
    created_by: 'u1',
    estado: 'confirmado',
    created_at: '2024-06-10T10:00:00Z',
    obra: OBRAS_MOCK[0],
    etapa: ETAPAS_MOCK[2],
    partida: PARTIDAS_MOCK[4],
    items: [ITEMS_MOCK[0], ITEMS_MOCK[1]],
  },
  {
    id: 'g2',
    obra_id: '2',
    etapa_id: '4',
    partida_id: '3',
    proveedor: 'Construmart San Bernardo',
    rut_proveedor: '78.645.210-3',
    fecha_boleta: '2024-06-12',
    moneda: 'CLP',
    total: 91600,
    imagen_url: IMG_OBRA_2,
    contexto_boleta: '',
    created_by: 'u1',
    estado: 'pendiente',
    created_at: '2024-06-12T09:00:00Z',
    obra: OBRAS_MOCK[1],
    etapa: ETAPAS_MOCK[3],
    partida: PARTIDAS_MOCK[2],
    items: [ITEMS_MOCK[2], ITEMS_MOCK[3]],
  },
]

export function formatCLP(monto: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(monto)
}
