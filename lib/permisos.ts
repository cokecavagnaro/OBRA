import type { Usuario } from './types'

export const PERMISOS = [
  { key: 'scan_receipts', label: 'Escanear boletas' },
  { key: 'tag_items', label: 'Etiquetar ítems' },
  { key: 'export_excel', label: 'Descargar Excel' },
  { key: 'create_obras', label: 'Crear obras' },
  { key: 'edit_scanned_items', label: 'Editar ítems escaneados' },
  { key: 'delete_scanned_items', label: 'Eliminar ítems/boletas' },
  { key: 'invite_users', label: 'Gestionar usuarios' },
  { key: 'view_reports', label: 'Ver reportes y presupuesto' },
] as const

export type PermisoKey = (typeof PERMISOS)[number]['key']

const DEFAULTS_POR_ROL: Record<'admin' | 'usuario', PermisoKey[]> = {
  admin: PERMISOS.map((p) => p.key),
  usuario: ['scan_receipts', 'tag_items'],
}

export function tienePermiso(
  usuario: Pick<Usuario, 'rol'>,
  overrides: { permission_key: string; granted: boolean }[],
  permiso: PermisoKey
): boolean {
  if (usuario.rol === 'super_admin') return true
  const override = overrides.find((o) => o.permission_key === permiso)
  if (override) return override.granted
  return DEFAULTS_POR_ROL[usuario.rol as 'admin' | 'usuario']?.includes(permiso) ?? false
}
