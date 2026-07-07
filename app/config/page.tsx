'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getObras, createObra, updateObraPrompt, getEtapas, createEtapa, getPartidas, createPartida,
  getUsuarioActual, getUsuariosDeCuenta, getCuenta, updateCuentaNombre,
  crearInvitacion, getInvitacionesPendientes, cancelarInvitacion,
  darDeBajaUsuario, reactivarUsuario, getPermisosOverrides,
} from '@/lib/supabase/db'
import { tienePermiso, PERMISOS, type PermisoKey } from '@/lib/permisos'
import EditarUsuarioModal from '@/components/EditarUsuarioModal'
import type { Obra, Etapa, Partida, Usuario, Cuenta, Invitacion, PermissionOverride } from '@/lib/types'

type Tab = 'obras' | 'cuenta'

export default function Config() {
  const [tab, setTab] = useState<Tab>('obras')

  const [obras, setObras] = useState<Obra[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [partidas, setPartidas] = useState<Partida[]>([])
  const [loading, setLoading] = useState(true)

  const [obraSeleccionada, setObraSeleccionada] = useState<Obra | null>(null)
  const [editandoPrompt, setEditandoPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')

  const [nuevaEtapa, setNuevaEtapa] = useState('')
  const [nuevaPartida, setNuevaPartida] = useState('')
  const [etapaParaPartida, setEtapaParaPartida] = useState<string>('')

  const [nuevaObra, setNuevaObra] = useState('')
  const [creandoObra, setCreandoObra] = useState(false)
  const [guardando, setGuardando] = useState(false)

  // Usuario actual + permisos
  const [usuarioActual, setUsuarioActual] = useState<Usuario | null>(null)
  const [misOverrides, setMisOverrides] = useState<PermissionOverride[]>([])

  // Pestaña Cuenta
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [nombreCuentaDraft, setNombreCuentaDraft] = useState('')
  const [editandoNombreCuenta, setEditandoNombreCuenta] = useState(false)
  const [usuariosCuenta, setUsuariosCuenta] = useState<Usuario[]>([])
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([])
  const [emailInvitar, setEmailInvitar] = useState('')
  const [rolInvitar, setRolInvitar] = useState<'admin' | 'usuario'>('usuario')
  const [overridesInvitar, setOverridesInvitar] = useState<{ permission_key: PermisoKey; granted: boolean }[]>([])
  const [linkInvitacion, setLinkInvitacion] = useState<string | null>(null)
  const [invitando, setInvitando] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null)

  // Crear contraseña (para quien entró siempre por link mágico)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [guardandoPassword, setGuardandoPassword] = useState(false)
  const [passwordMensaje, setPasswordMensaje] = useState('')
  const [overridesUsuarioEditando, setOverridesUsuarioEditando] = useState<PermissionOverride[]>([])

  const puedeCrearObras = usuarioActual ? tienePermiso(usuarioActual, misOverrides, 'create_obras') : false
  const puedeGestionarUsuarios = usuarioActual ? tienePermiso(usuarioActual, misOverrides, 'invite_users') : false
  const puedeVerCuenta = !!usuarioActual

  useEffect(() => {
    getObras().then((data) => {
      setObras(data)
      setLoading(false)
    })
    getUsuarioActual().then(async (u) => {
      setUsuarioActual(u)
      if (u) {
        const overrides = await getPermisosOverrides(u.id)
        setMisOverrides(overrides)
      }
    })
  }, [])

  useEffect(() => {
    if (tab !== 'cuenta' || !usuarioActual) return
    getCuenta(usuarioActual.cuenta_id).then((c) => {
      setCuenta(c)
      setNombreCuentaDraft(c?.nombre ?? '')
    })
    getUsuariosDeCuenta(usuarioActual.cuenta_id).then(setUsuariosCuenta)
    getInvitacionesPendientes(usuarioActual.cuenta_id).then(setInvitaciones)
  }, [tab, usuarioActual])

  async function guardarNombreCuenta() {
    if (!usuarioActual) return
    await updateCuentaNombre(usuarioActual.cuenta_id, nombreCuentaDraft)
    setCuenta((prev) => prev ? { ...prev, nombre: nombreCuentaDraft } : prev)
    setEditandoNombreCuenta(false)
  }

  async function handleCrearPassword() {
    setPasswordMensaje('')
    if (nuevaPassword.length < 6) {
      setPasswordMensaje('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (nuevaPassword !== confirmarPassword) {
      setPasswordMensaje('Las contraseñas no coinciden')
      return
    }
    setGuardandoPassword(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword })
    if (error) {
      setPasswordMensaje(error.message)
    } else {
      setPasswordMensaje('Contraseña creada. Ya puedes entrar con ella.')
      setNuevaPassword('')
      setConfirmarPassword('')
    }
    setGuardandoPassword(false)
  }

  async function handleInvitar() {
    if (!usuarioActual || !emailInvitar.trim()) return
    setInvitando(true)
    const resultado = await crearInvitacion(emailInvitar.trim(), rolInvitar, overridesInvitar)
    if (resultado.ok) {
      const nuevas = await getInvitacionesPendientes(usuarioActual.cuenta_id)
      setInvitaciones(nuevas)
      setEmailInvitar('')
      setRolInvitar('usuario')
      setOverridesInvitar([])
      setLinkInvitacion(resultado.link ?? null)
    }
    setInvitando(false)
  }

  // A diferencia de EditarUsuarioModal (que graba cada override al toque, porque el
  // usuario ya existe), acá todavía no hay invitación creada — todo queda en estado
  // local y se manda junto recién al enviar el formulario completo.
  function toggleOverrideInvitar(permiso: PermisoKey) {
    const actual = tienePermiso({ rol: rolInvitar }, overridesInvitar, permiso)
    setOverridesInvitar((prev) => [
      ...prev.filter((o) => o.permission_key !== permiso),
      { permission_key: permiso, granted: !actual },
    ])
  }

  async function handleCancelarInvitacion(id: string) {
    await cancelarInvitacion(id)
    setInvitaciones((prev) => prev.filter((i) => i.id !== id))
  }

  async function handleDarDeBaja(u: Usuario) {
    if (u.activo) await darDeBajaUsuario(u.id)
    else await reactivarUsuario(u.id)
    setUsuariosCuenta((prev) => prev.map((x) => x.id === u.id ? { ...x, activo: !u.activo } : x))
  }

  async function abrirEdicionUsuario(u: Usuario) {
    const overrides = await getPermisosOverrides(u.id)
    setOverridesUsuarioEditando(overrides)
    setUsuarioEditando(u)
  }

  async function seleccionar(obra: Obra) {
    setObraSeleccionada(obra)
    setEditandoPrompt(false)
    setNuevaEtapa('')
    setNuevaPartida('')
    setEtapaParaPartida('')
    const [e, p] = await Promise.all([getEtapas(obra.id), getPartidas(obra.id)])
    setEtapas(e)
    setPartidas(p)
  }

  async function guardarPrompt() {
    if (!obraSeleccionada) return
    await updateObraPrompt(obraSeleccionada.id, promptDraft)
    setObras((prev) => prev.map((o) => o.id === obraSeleccionada.id ? { ...o, system_prompt: promptDraft } : o))
    setObraSeleccionada((prev) => prev ? { ...prev, system_prompt: promptDraft } : null)
    setEditandoPrompt(false)
  }

  async function agregarEtapa() {
    if (!obraSeleccionada || !nuevaEtapa.trim()) return
    setGuardando(true)
    const nueva = await createEtapa(obraSeleccionada.id, nuevaEtapa.trim(), etapas.length + 1)
    if (nueva) setEtapas((prev) => [...prev, nueva])
    setNuevaEtapa('')
    setGuardando(false)
  }

  async function agregarPartida() {
    if (!obraSeleccionada || !nuevaPartida.trim()) return
    setGuardando(true)
    const nueva = await createPartida(obraSeleccionada.id, nuevaPartida.trim(), etapaParaPartida || undefined)
    if (nueva) setPartidas((prev) => [...prev, nueva])
    setNuevaPartida('')
    setGuardando(false)
  }

  async function crearObra() {
    if (!nuevaObra.trim()) return
    setGuardando(true)
    const nueva = await createObra(nuevaObra.trim())
    if (nueva) {
      setObras((prev) => [...prev, nueva])
      setNuevaObra('')
      setCreandoObra(false)
      seleccionar(nueva)
    }
    setGuardando(false)
  }

  async function handleCerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const etapasFiltradas = etapas.filter((e) => e.obra_id === obraSeleccionada?.id)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
            <p className="text-xs text-gray-400 mt-0.5">Obras, etapas y partidas</p>
          </div>
          <button onClick={handleCerrarSesion} className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5">
            Cerrar sesión
          </button>
        </div>

        {puedeVerCuenta && (
          <div className="flex gap-2 mt-4 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setTab('obras')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${tab === 'obras' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
            >
              Obras
            </button>
            <button
              onClick={() => setTab('cuenta')}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${tab === 'cuenta' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
            >
              Cuenta
            </button>
          </div>
        )}
      </div>

      {tab === 'obras' && (
      <div className="px-4 py-4 space-y-4">
        {/* Lista de obras */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Obras</p>
            {puedeCrearObras && (
              <button onClick={() => setCreandoObra(true)} className="text-xs font-medium text-blue-600">
                + Nueva obra
              </button>
            )}
          </div>

          {creandoObra && (
            <div className="flex gap-2 mb-2">
              <input
                autoFocus
                type="text"
                value={nuevaObra}
                onChange={(e) => setNuevaObra(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && crearObra()}
                placeholder="Nombre de la obra"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={crearObra} disabled={guardando} className="bg-blue-600 text-white px-3 rounded-lg text-sm font-medium disabled:opacity-40">Crear</button>
              <button onClick={() => setCreandoObra(false)} className="text-gray-400 px-2 text-sm">✕</button>
            </div>
          )}

          <div className="space-y-1.5">
            {obras.length === 0 && !creandoObra && (
              <p className="text-xs text-gray-300 italic py-2">Sin obras — crea la primera</p>
            )}
            {obras.map((obra) => (
              <button
                key={obra.id}
                onClick={() => seleccionar(obra)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  obraSeleccionada?.id === obra.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{obra.nombre}</p>
                {obra.system_prompt ? (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{obra.system_prompt}</p>
                ) : (
                  <p className="text-xs text-gray-300 mt-0.5 italic">Sin instrucciones</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Detalle de obra seleccionada */}
        {obraSeleccionada && (
          <>
            {/* System prompt */}
            <div className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Instrucciones de IA</p>
                {!editandoPrompt && (
                  <button
                    onClick={() => { setEditandoPrompt(true); setPromptDraft(obraSeleccionada.system_prompt) }}
                    className="text-xs text-blue-600 font-medium"
                  >
                    ✏ Editar
                  </button>
                )}
              </div>
              {editandoPrompt ? (
                <>
                  <textarea
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    rows={5}
                    placeholder="Ej: El hormigón siempre va a Fundaciones aunque no se indique..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setEditandoPrompt(false)} className="flex-1 border border-gray-200 rounded-lg py-2 text-xs text-gray-500">Cancelar</button>
                    <button onClick={guardarPrompt} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-xs font-semibold">Guardar</button>
                  </div>
                </>
              ) : (
                <p className={`text-sm leading-relaxed ${obraSeleccionada.system_prompt ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                  {obraSeleccionada.system_prompt || 'Sin instrucciones definidas'}
                </p>
              )}
            </div>

            {/* Etapas */}
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Etapas</p>
              <div className="space-y-1.5 mb-3">
                {etapasFiltradas.length === 0 && <p className="text-xs text-gray-300 italic">Sin etapas</p>}
                {etapasFiltradas.map((etapa) => (
                  <p key={etapa.id} className="text-sm text-gray-700 py-1 border-b border-gray-50 last:border-0">{etapa.nombre}</p>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevaEtapa}
                  onChange={(e) => setNuevaEtapa(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && agregarEtapa()}
                  placeholder="Nueva etapa..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <button onClick={agregarEtapa} disabled={guardando} className="bg-gray-900 text-white px-3 rounded-lg text-sm font-medium disabled:opacity-40">+</button>
              </div>
            </div>

            {/* Partidas */}
            <div className="rounded-xl border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Partidas</p>

              <div className="space-y-1.5 mb-3">
                {partidas.filter((p) => p.obra_id === obraSeleccionada.id).length === 0 && (
                  <p className="text-xs text-gray-300 italic">Sin partidas</p>
                )}
                {partidas.filter((p) => p.obra_id === obraSeleccionada.id).map((p) => {
                  const etapa = etapas.find((e) => e.id === p.etapa_id)
                  return (
                    <div key={p.id} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                      <p className="text-sm text-gray-700">{p.nombre}</p>
                      <span className="text-xs text-gray-400">{etapa?.nombre ?? '—'}</span>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] text-gray-400">Etapa (opcional)</p>
                <select
                  value={etapaParaPartida}
                  onChange={(e) => setEtapaParaPartida(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Sin etapa</option>
                  {etapasFiltradas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={nuevaPartida}
                    onChange={(e) => setNuevaPartida(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && agregarPartida()}
                    placeholder="Nueva partida..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <button onClick={agregarPartida} disabled={guardando} className="bg-gray-900 text-white px-3 rounded-lg text-sm font-medium disabled:opacity-40">+</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {tab === 'cuenta' && usuarioActual && (
        <div className="px-4 py-4 space-y-4">
          {/* Datos de la cuenta */}
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Nombre de la empresa</p>
              {puedeGestionarUsuarios && !editandoNombreCuenta && (
                <button onClick={() => setEditandoNombreCuenta(true)} className="text-xs text-blue-600 font-medium">✏ Editar</button>
              )}
            </div>
            {editandoNombreCuenta ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={nombreCuentaDraft}
                  onChange={(e) => setNombreCuentaDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && guardarNombreCuenta()}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <button onClick={guardarNombreCuenta} className="bg-blue-600 text-white px-3 rounded-lg text-sm font-medium">Guardar</button>
              </div>
            ) : (
              <p className="text-sm text-gray-700">{cuenta?.nombre}</p>
            )}
          </div>

          {/* Crear contraseña */}
          <div className="rounded-xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Contraseña</p>
            <p className="text-xs text-gray-400 mb-3">Si siempre entras con el link por correo, puedes crear una contraseña para no depender de él.</p>
            <div className="space-y-2">
              <input
                type="password"
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                placeholder="Nueva contraseña"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                placeholder="Confirmar contraseña"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
              {passwordMensaje && <p className="text-xs text-gray-500">{passwordMensaje}</p>}
              <button
                onClick={handleCrearPassword}
                disabled={guardandoPassword || !nuevaPassword || !confirmarPassword}
                className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40"
              >
                {guardandoPassword ? 'Guardando...' : 'Crear contraseña'}
              </button>
            </div>
          </div>

          {puedeGestionarUsuarios && (
            <>
              {/* Usuarios */}
              <div className="rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Usuarios</p>
                <div className="space-y-1.5 mb-3">
                  {usuariosCuenta.map((u) => (
                    <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 truncate">{u.email}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-gray-400 uppercase">{u.rol}</span>
                          {!u.activo && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Inactivo</span>
                          )}
                        </div>
                      </div>
                      {u.rol !== 'super_admin' && (
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <button onClick={() => abrirEdicionUsuario(u)} className="text-xs text-blue-600 font-medium">Editar</button>
                          <button onClick={() => handleDarDeBaja(u)} className="text-xs text-gray-400 font-medium">
                            {u.activo ? 'Dar de baja' : 'Reactivar'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Invitar usuario */}
              <div className="rounded-xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Invitar usuario</p>
                <div className="space-y-2">
                  <input
                    type="email"
                    value={emailInvitar}
                    onChange={(e) => setEmailInvitar(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <select
                    value={rolInvitar}
                    onChange={(e) => setRolInvitar(e.target.value as 'admin' | 'usuario')}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="usuario">Usuario</option>
                    <option value="admin">Admin</option>
                  </select>

                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Permisos</p>
                    <div className="space-y-1">
                      {PERMISOS.map((p) => (
                        <label
                          key={p.key}
                          className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0"
                        >
                          <span className="text-sm text-gray-700">{p.label}</span>
                          <input
                            type="checkbox"
                            checked={tienePermiso({ rol: rolInvitar }, overridesInvitar, p.key)}
                            onChange={() => toggleOverrideInvitar(p.key)}
                            className="w-4 h-4"
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleInvitar}
                    disabled={invitando || !emailInvitar.trim()}
                    className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    {invitando ? 'Generando...' : 'Invitar (genera link)'}
                  </button>

                  {linkInvitacion && (
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-gray-600">Copiá este link y mandaselo a la persona invitada:</p>
                      <p className="text-xs text-gray-500 break-all">{linkInvitacion}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(linkInvitacion)}
                          className="flex-1 bg-gray-900 text-white rounded-lg py-1.5 text-xs font-semibold"
                        >
                          Copiar link
                        </button>
                        <button
                          onClick={() => setLinkInvitacion(null)}
                          className="text-xs text-gray-400 px-2"
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {invitaciones.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] text-gray-400 uppercase">Pendientes</p>
                    {invitaciones.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between py-1">
                        <p className="text-sm text-gray-700">{inv.email} <span className="text-xs text-gray-400">({inv.rol})</span></p>
                        <button onClick={() => handleCancelarInvitacion(inv.id)} className="text-xs text-gray-400">Cancelar</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {usuarioEditando && (
        <EditarUsuarioModal
          usuario={usuarioEditando}
          overridesIniciales={overridesUsuarioEditando}
          onGuardado={(u) => {
            setUsuariosCuenta((prev) => prev.map((x) => x.id === u.id ? u : x))
            setUsuarioEditando(null)
          }}
          onCerrar={() => setUsuarioEditando(null)}
        />
      )}
    </div>
  )
}
