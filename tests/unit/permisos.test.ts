import { describe, it, expect } from 'vitest'
import { tienePermiso, PERMISOS, type PermisoKey } from '@/lib/permisos'
import type { Usuario } from '@/lib/types'

const DEFAULTS_ADMIN: PermisoKey[] = PERMISOS.map((p) => p.key)
const DEFAULTS_USUARIO: PermisoKey[] = ['scan_receipts', 'tag_items']

describe('tienePermiso — bypass de super_admin', () => {
  it('super_admin siempre tiene cualquier permiso, sin overrides', () => {
    for (const { key } of PERMISOS) {
      expect(tienePermiso({ rol: 'super_admin' }, [], key)).toBe(true)
    }
  })

  it('super_admin ignora un override que intenta revocarle un permiso', () => {
    const overrides = [{ permission_key: 'approve_boletas', granted: false }]
    expect(tienePermiso({ rol: 'super_admin' }, overrides, 'approve_boletas')).toBe(true)
  })
})

describe('tienePermiso — matriz de defaults por rol, sin overrides', () => {
  for (const { key } of PERMISOS) {
    const esperadoAdmin = DEFAULTS_ADMIN.includes(key)
    it(`admin ${esperadoAdmin ? 'tiene' : 'no tiene'} "${key}" por default`, () => {
      expect(tienePermiso({ rol: 'admin' }, [], key)).toBe(esperadoAdmin)
    })

    const esperadoUsuario = DEFAULTS_USUARIO.includes(key)
    it(`usuario ${esperadoUsuario ? 'tiene' : 'no tiene'} "${key}" por default`, () => {
      expect(tienePermiso({ rol: 'usuario' }, [], key)).toBe(esperadoUsuario)
    })
  }
})

describe('tienePermiso — overrides', () => {
  it('un override granted:false le revoca a un admin un permiso que tiene por default', () => {
    const overrides = [{ permission_key: 'approve_boletas', granted: false }]
    expect(tienePermiso({ rol: 'admin' }, overrides, 'approve_boletas')).toBe(false)
  })

  it('un override granted:true le da a un usuario un permiso fuera de su default', () => {
    const overrides = [{ permission_key: 'export_excel', granted: true }]
    expect(tienePermiso({ rol: 'usuario' }, overrides, 'export_excel')).toBe(true)
  })

  it('un override con permission_key que no matchea se ignora y cae al default', () => {
    const overrides = [{ permission_key: 'algo_inexistente', granted: true }]
    expect(tienePermiso({ rol: 'usuario' }, overrides, 'export_excel')).toBe(false)
  })
})

describe('tienePermiso — rol no contemplado', () => {
  it('un rol fuera de admin/usuario/super_admin, sin overrides, da false', () => {
    const usuarioInvalido = { rol: 'invitado' } as unknown as Pick<Usuario, 'rol'>
    expect(tienePermiso(usuarioInvalido, [], 'scan_receipts')).toBe(false)
  })
})
