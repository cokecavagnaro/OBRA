'use client'

import { useState } from 'react'
import { actualizarRolUsuario, setPermisoOverride } from '@/lib/supabase/db'
import { PERMISOS, tienePermiso, type PermisoKey } from '@/lib/permisos'
import type { Usuario, PermissionOverride } from '@/lib/types'

interface Props {
  usuario: Usuario
  overridesIniciales: PermissionOverride[]
  onGuardado: (usuario: Usuario, overrides: PermissionOverride[]) => void
  onCerrar: () => void
}

export default function EditarUsuarioModal({ usuario, overridesIniciales, onGuardado, onCerrar }: Props) {
  const [rol, setRol] = useState<'admin' | 'usuario'>(usuario.rol === 'admin' ? 'admin' : 'usuario')
  const [overrides, setOverrides] = useState<PermissionOverride[]>(overridesIniciales)
  const [guardando, setGuardando] = useState(false)

  const usuarioConRol = { ...usuario, rol }

  async function toggleOverride(permiso: PermisoKey) {
    const actual = tienePermiso(usuarioConRol, overrides, permiso)
    const nuevoValor = !actual
    setOverrides((prev) => [
      ...prev.filter((o) => o.permission_key !== permiso),
      { user_id: usuario.id, permission_key: permiso, granted: nuevoValor },
    ])
    await setPermisoOverride(usuario.id, permiso, nuevoValor)
  }

  async function handleGuardar() {
    setGuardando(true)
    await actualizarRolUsuario(usuario.id, rol)
    onGuardado({ ...usuario, rol }, overrides)
    setGuardando(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={onCerrar}>
      <div
        className="bg-white rounded-t-2xl w-full max-w-[390px] flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-gray-900">{usuario.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">{usuario.nombre || 'Sin nombre'}</p>
          </div>
          <button onClick={onCerrar} className="text-gray-400 ml-3">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Rol</p>
            <select
              value={rol}
              onChange={(e) => setRol(e.target.value as 'admin' | 'usuario')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"
            >
              <option value="usuario">Usuario</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Permisos</p>
            <div className="space-y-1">
              {PERMISOS.map((p) => (
                <label
                  key={p.key}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <span className="text-sm text-gray-700">{p.label}</span>
                  <input
                    type="checkbox"
                    checked={tienePermiso(usuarioConRol, overrides, p.key)}
                    onChange={() => toggleOverride(p.key)}
                    className="w-4 h-4"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 pt-3 border-t border-gray-100 shrink-0" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px) + 64px)' }}>
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="w-full bg-blue-600 text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
