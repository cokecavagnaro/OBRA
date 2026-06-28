export type Moneda = 'CLP' | 'UF'
export type RolUsuario = 'admin' | 'operario' | 'visor'
export type EstadoGasto = 'confirmado' | 'pendiente'
export type EstadoItem = 'confirmado' | 'pendiente' | 'rechazado'

export interface Obra {
  id: string
  nombre: string
  system_prompt: string
  created_at: string
}

export interface Etapa {
  id: string
  obra_id: string
  nombre: string
  orden: number
}

export interface Partida {
  id: string
  etapa_id: string
  nombre: string
}

export interface Usuario {
  id: string
  nombre: string
  rol: RolUsuario
}

export interface Gasto {
  id: string
  obra_id: string
  etapa_id: string
  partida_id: string
  proveedor: string
  rut_proveedor: string
  fecha_boleta: string
  moneda: Moneda
  total: number
  imagen_url: string
  contexto_boleta: string
  created_by: string
  estado: EstadoGasto
  created_at: string
  // relaciones expandidas
  obra?: Obra
  etapa?: Etapa
  partida?: Partida
  items?: ItemGasto[]
}

export interface ItemGasto {
  id: string
  gasto_id: string
  descripcion: string
  cantidad: number
  unidad: string
  precio_unitario: number
  subtotal: number
  categoria: string
  etiquetas: string[]
  confianza_ia: number
  etapa_id: string
  partida_id: string
  estado: EstadoItem
  created_at: string
}

// Respuesta de la API de análisis
export interface RespuestaAnalisis {
  proveedor: string
  rut: string
  fecha: string
  moneda: Moneda
  items: ItemAnalizado[]
  total: number
}

export interface ItemAnalizado {
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
}

// Estado del formulario de escaneo
export interface FormularioEscaneo {
  obra: Obra | null
  etapa: Etapa | null
  partida: Partida | null
  contexto_boleta: string
}
