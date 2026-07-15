export type Moneda = 'CLP' | 'UF'
export type RolUsuario = 'super_admin' | 'admin' | 'usuario'
export type EstadoGasto = 'confirmado' | 'pendiente'
export type EstadoItem = 'confirmado' | 'pendiente' | 'rechazado'

export interface Cuenta {
  id: string
  nombre: string
  created_at: string
}

export interface Proyecto {
  id: string
  nombre: string
  system_prompt: string
  cuenta_id?: string
  presupuesto?: number | null
  created_at: string
}

export interface Etapa {
  id: string
  proyecto_id: string
  nombre: string
  orden: number
  presupuesto?: number | null
}

export interface Partida {
  id: string
  proyecto_id: string
  etapa_id?: string
  nombre: string
  presupuesto?: number | null
}

export interface Usuario {
  id: string
  cuenta_id: string
  nombre: string
  email: string
  rol: RolUsuario
  activo: boolean
}

export interface Invitacion {
  id: string
  cuenta_id: string
  email: string
  rol: 'admin' | 'usuario'
  invitado_por: string
  usada: boolean
  created_at: string
}

export interface PermissionOverride {
  user_id: string
  permission_key: string
  granted: boolean
}

export interface InvitacionPermissionOverride {
  invitacion_id: string
  permission_key: string
  granted: boolean
}

export interface Gasto {
  id: string
  proyecto_id: string
  etapa_id: string
  partida_id: string
  proveedor: string
  rut_proveedor: string
  fecha_boleta: string
  moneda: Moneda
  total: number
  imagen_url: string
  contexto_boleta: string
  creado_por_email: string | null
  comentario: string | null
  estado: EstadoGasto
  created_at: string
  // relaciones expandidas
  proyecto?: Proyecto
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

export interface DocumentoConfianza {
  confianza_documento: number
  calidad_imagen_percibida: number
}

// Respuesta de la API de análisis
export interface RespuestaAnalisis {
  proveedor: string
  rut: string
  fecha: string
  moneda: Moneda
  items: ItemAnalizado[]
  total: number
  documento?: DocumentoConfianza
  confianza_documento?: number
  verificado_por_reescritura?: boolean
  requiere_atencion?: boolean
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
  proyecto: Proyecto | null
  etapa: Etapa | null
  partida: Partida | null
  contexto_boleta: string
}

// Clasificación de un producto aprendida de escaneos anteriores
export interface ClasificacionAprendida {
  id: string
  proyecto_id: string
  descripcion_normalizada: string
  categoria: string
  etiquetas: string[]
  veces_confirmado: number
  updated_at: string
}
