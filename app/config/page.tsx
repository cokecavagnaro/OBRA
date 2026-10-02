'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  getProyectos, createProyecto, updateProyectoPresupuesto, deleteProyecto, getEtapas, createEtapa, getPartidas, createPartida,
  updateEtapaPresupuesto, updatePartidaPresupuesto,
  getUsuarioActual, getUsuariosDeCuenta, getCuenta, updateCuentaNombre,
  crearInvitacion, getInvitacionesPendientes, cancelarInvitacion,
  darDeBajaUsuario, reactivarUsuario, getPermisosOverrides,
} from '@/lib/supabase/db'
import { tienePermiso, PERMISOS, type PermisoKey } from '@/lib/permisos'
import EditarUsuarioModal from '@/components/EditarUsuarioModal'
import InputPresupuesto from '@/components/InputPresupuesto'
import type { Proyecto, Etapa, Partida, Usuario, Cuenta, Invitacion, PermissionOverride } from '@/lib/types'

type Tab = 'proyectos' | 'cuenta'

function ConfigContenido() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') === 'cuenta' ? 'cuenta' : 'proyectos'
  const [tab, setTab] = useState<Tab>(tabParam)

  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [partidas, setPartidas] = useState<Partida[]>([])
  const [loading, setLoading] = useState(true)

  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<Proyecto | null>(null)

  const [nuevaEtapa, setNuevaEtapa] = useState('')
  const [nuevaEtapaPresupuesto, setNuevaEtapaPresupuesto] = useState('')
  const [nuevaPartida, setNuevaPartida] = useState('')
  const [nuevaPartidaPresupuesto, setNuevaPartidaPresupuesto] = useState('')
  const [etapaParaPartida, setEtapaParaPartida] = useState<string>('')

  const [nuevoProyecto, setNuevoProyecto] = useState('')
  const [nuevoProyectoPresupuesto, setNuevoProyectoPresupuesto] = useState('')
  const [creandoProyecto, setCreandoProyecto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const [eliminandoProyecto, setEliminandoProyecto] = useState(false)
  const [confirmacionNombreProyecto, setConfirmacionNombreProyecto] = useState('')
  const [borrandoProyecto, setBorrandoProyecto] = useState(false)

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

  const puedeCrearProyectos = usuarioActual ? tienePermiso(usuarioActual, misOverrides, 'create_proyectos') : false
  const puedeEliminarProyecto = usuarioActual ? tienePermiso(usuarioActual, misOverrides, 'delete_proyectos') : false
  const puedeGestionarUsuarios = usuarioActual ? tienePermiso(usuarioActual, misOverrides, 'invite_users') : false
  const puedeVerCuenta = !!usuarioActual

  useEffect(() => {
    getProyectos().then((data) => {
      setProyectos(data)
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

  async function seleccionar(proyecto: Proyecto) {
    setProyectoSeleccionado(proyecto)
    setNuevaEtapa('')
    setNuevaPartida('')
    setEtapaParaPartida('')
    setEliminandoProyecto(false)
    setConfirmacionNombreProyecto('')
    const [e, p] = await Promise.all([getEtapas(proyecto.id), getPartidas(proyecto.id)])
    setEtapas(e)
    setPartidas(p)
  }

  async function actualizarPresupuestoProyecto(valor: string) {
    if (!proyectoSeleccionado) return
    const presupuesto = valor.trim() ? Number(valor) : null
    setProyectos((prev) => prev.map((p) => p.id === proyectoSeleccionado.id ? { ...p, presupuesto } : p))
    setProyectoSeleccionado((prev) => prev ? { ...prev, presupuesto } : prev)
    await updateProyectoPresupuesto(proyectoSeleccionado.id, presupuesto)
  }

  async function handleEliminarProyecto() {
    if (!proyectoSeleccionado || confirmacionNombreProyecto.trim() !== proyectoSeleccionado.nombre) return
    setBorrandoProyecto(true)
    const ok = await deleteProyecto(proyectoSeleccionado)
    if (ok) {
      setProyectos((prev) => prev.filter((p) => p.id !== proyectoSeleccionado.id))
      setProyectoSeleccionado(null)
      setEtapas([])
      setPartidas([])
    }
    setEliminandoProyecto(false)
    setConfirmacionNombreProyecto('')
    setBorrandoProyecto(false)
  }

  async function agregarEtapa() {
    if (!proyectoSeleccionado || !nuevaEtapa.trim()) return
    setGuardando(true)
    const presupuesto = nuevaEtapaPresupuesto.trim() ? Number(nuevaEtapaPresupuesto) : null
    const nueva = await createEtapa(proyectoSeleccionado.id, nuevaEtapa.trim(), etapas.length + 1, presupuesto)
    if (nueva) setEtapas((prev) => [...prev, nueva])
    setNuevaEtapa('')
    setNuevaEtapaPresupuesto('')
    setGuardando(false)
  }

  async function agregarPartida() {
    if (!proyectoSeleccionado || !nuevaPartida.trim()) return
    setGuardando(true)
    const presupuesto = nuevaPartidaPresupuesto.trim() ? Number(nuevaPartidaPresupuesto) : null
    const nueva = await createPartida(proyectoSeleccionado.id, nuevaPartida.trim(), etapaParaPartida || undefined, presupuesto)
    if (nueva) setPartidas((prev) => [...prev, nueva])
    setNuevaPartida('')
    setNuevaPartidaPresupuesto('')
    setGuardando(false)
  }

  async function actualizarPresupuestoEtapa(id: string, valor: string) {
    const presupuesto = valor.trim() ? Number(valor) : null
    setEtapas((prev) => prev.map((e) => e.id === id ? { ...e, presupuesto } : e))
    await updateEtapaPresupuesto(id, presupuesto)
  }

  async function actualizarPresupuestoPartida(id: string, valor: string) {
    const presupuesto = valor.trim() ? Number(valor) : null
    setPartidas((prev) => prev.map((p) => p.id === id ? { ...p, presupuesto } : p))
    await updatePartidaPresupuesto(id, presupuesto)
  }

  async function crearProyecto() {
    if (!nuevoProyecto.trim()) return
    setGuardando(true)
    const presupuesto = nuevoProyectoPresupuesto.trim() ? Number(nuevoProyectoPresupuesto) : null
    const nueva = await createProyecto(nuevoProyecto.trim(), '', presupuesto)
    if (nueva) {
      setProyectos((prev) => [...prev, nueva])
      setNuevoProyecto('')
      setNuevoProyectoPresupuesto('')
      setCreandoProyecto(false)
      seleccionar(nueva)
    }
    setGuardando(false)
  }

  async function handleCerrarSesion() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const etapasFiltradas = etapas.filter((e) => e.proyecto_id === proyectoSeleccionado?.id)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gris-texto text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-crema">
      <div className="px-4 pt-12 pb-4 border-b-2 border-tinta bg-crema-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-tinta">Configuración</h1>
            <p className="text-xs text-gris-texto mt-0.5">Proyectos, etapas y partidas</p>
          </div>
          <button onClick={handleCerrarSesion} className="text-xs text-gris-texto border-2 border-tinta px-3 py-1.5">
            Cerrar sesión
          </button>
        </div>

        {puedeVerCuenta && (
          <div className="flex gap-2 mt-4 bg-white border-2 border-tinta p-1">
            <button
              onClick={() => setTab('proyectos')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'proyectos' ? 'bg-tinta text-dorado' : 'text-gris-texto'}`}
            >
              Proyectos
            </button>
            <button
              onClick={() => setTab('cuenta')}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${tab === 'cuenta' ? 'bg-tinta text-dorado' : 'text-gris-texto'}`}
            >
              Cuenta
            </button>
          </div>
        )}
      </div>

      {tab === 'proyectos' && (
      <div className="px-4 py-4 space-y-4">
        {/* Lista de proyectos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide">Proyectos</p>
            {puedeCrearProyectos && (
              <button onClick={() => setCreandoProyecto(true)} className="text-xs font-medium text-dorado-link">
                + Nuevo proyecto
              </button>
            )}
          </div>

          {creandoProyecto && (
            <div className="flex gap-2 mb-2">
              <input
                autoFocus
                type="text"
                value={nuevoProyecto}
                onChange={(e) => setNuevoProyecto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && crearProyecto()}
                placeholder="Nombre del proyecto"
                className="flex-1 border-2 border-tinta px-3 py-2 text-sm"
              />
              <InputPresupuesto
                value={nuevoProyectoPresupuesto}
                onChange={setNuevoProyectoPresupuesto}
                onEnter={crearProyecto}
                placeholder="Presupuesto (opcional)"
                className="w-36 border-2 border-tinta px-3 py-2 text-sm"
              />
              <button onClick={crearProyecto} disabled={guardando} className="bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta px-3 text-sm font-medium disabled:opacity-40">Crear</button>
              <button onClick={() => setCreandoProyecto(false)} className="text-gris-texto px-2 text-sm">✕</button>
            </div>
          )}

          <div className="space-y-1.5">
            {proyectos.length === 0 && !creandoProyecto && (
              <p className="text-xs text-gris-texto italic py-2">Sin proyectos — crea el primero</p>
            )}
            {proyectos.map((proyecto) => (
              <button
                key={proyecto.id}
                onClick={() => seleccionar(proyecto)}
                className={`w-full text-left border-2 px-4 py-3 transition-colors ${
                  proyectoSeleccionado?.id === proyecto.id ? 'border-tinta bg-dorado/40' : 'border-tinta hover:border-tinta'
                }`}
              >
                <p className="text-sm font-medium text-tinta">{proyecto.nombre}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Detalle de proyecto seleccionado */}
        {proyectoSeleccionado && (
          <>
            {/* Presupuesto del proyecto */}
            <div className=" border-2 border-tinta p-4 bg-white shadow-hard-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide">Presupuesto total</p>
                <InputPresupuesto
                  key={proyectoSeleccionado.id}
                  defaultValue={proyectoSeleccionado.presupuesto}
                  onCommit={actualizarPresupuestoProyecto}
                  placeholder="Presupuesto (opcional)"
                  className="w-40 border-2 border-tinta px-2 py-1.5 text-sm text-right"
                />
              </div>
            </div>

            {/* Etapas */}
            <div className=" border-2 border-tinta p-4 bg-white shadow-hard-sm">
              <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide mb-3">Etapas</p>
              <div className="space-y-1.5 mb-3">
                {etapasFiltradas.length === 0 && <p className="text-xs text-gris-texto italic">Sin etapas</p>}
                {etapasFiltradas.map((etapa) => (
                  <div key={etapa.id} className="flex items-center justify-between gap-2 py-1 border-b-2 border-tinta last:border-0">
                    <p className="text-sm text-gris-medio">{etapa.nombre}</p>
                    <InputPresupuesto
                      defaultValue={etapa.presupuesto}
                      onCommit={(valor) => actualizarPresupuestoEtapa(etapa.id, valor)}
                      placeholder="Presupuesto"
                      className="w-28 border-2 border-tinta px-2 py-1 text-xs text-right"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevaEtapa}
                  onChange={(e) => setNuevaEtapa(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && agregarEtapa()}
                  placeholder="Nueva etapa..."
                  className="flex-1 border-2 border-tinta px-3 py-2 text-sm"
                />
                <InputPresupuesto
                  value={nuevaEtapaPresupuesto}
                  onChange={setNuevaEtapaPresupuesto}
                  onEnter={agregarEtapa}
                  placeholder="Presupuesto"
                  className="w-28 border-2 border-tinta px-2 py-2 text-sm"
                />
                <button onClick={agregarEtapa} disabled={guardando} className="bg-tinta text-dorado px-3 text-sm font-medium disabled:opacity-40">+</button>
              </div>
            </div>

            {/* Partidas */}
            <div className=" border-2 border-tinta p-4 bg-white shadow-hard-sm">
              <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide mb-3">Partidas</p>

              <div className="space-y-1.5 mb-3">
                {partidas.filter((p) => p.proyecto_id === proyectoSeleccionado.id).length === 0 && (
                  <p className="text-xs text-gris-texto italic">Sin partidas</p>
                )}
                {partidas.filter((p) => p.proyecto_id === proyectoSeleccionado.id).map((p) => {
                  const etapa = etapas.find((e) => e.id === p.etapa_id)
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2 py-1 border-b-2 border-tinta last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm text-gris-medio truncate">{p.nombre}</p>
                        <span className="text-xs text-gris-texto">{etapa?.nombre ?? '—'}</span>
                      </div>
                      <InputPresupuesto
                        defaultValue={p.presupuesto}
                        onCommit={(valor) => actualizarPresupuestoPartida(p.id, valor)}
                        placeholder="Presupuesto"
                        className="w-28 shrink-0 border-2 border-tinta px-2 py-1 text-xs text-right"
                      />
                    </div>
                  )
                })}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] text-gris-texto">Etapa (opcional)</p>
                <select
                  value={etapaParaPartida}
                  onChange={(e) => setEtapaParaPartida(e.target.value)}
                  className="w-full border-2 border-tinta px-3 py-2 text-sm bg-white"
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
                    className="flex-1 border-2 border-tinta px-3 py-2 text-sm"
                  />
                  <InputPresupuesto
                    value={nuevaPartidaPresupuesto}
                    onChange={setNuevaPartidaPresupuesto}
                    onEnter={agregarPartida}
                    placeholder="Presupuesto"
                    className="w-28 border-2 border-tinta px-2 py-2 text-sm"
                  />
                  <button onClick={agregarPartida} disabled={guardando} className="bg-tinta text-dorado px-3 text-sm font-medium disabled:opacity-40">+</button>
                </div>
              </div>
            </div>

            {/* Eliminar proyecto */}
            {puedeEliminarProyecto && (
              <div className=" border-2 border-error p-4">
                {!eliminandoProyecto ? (
                  <button onClick={() => setEliminandoProyecto(true)} className="text-sm text-error font-medium">
                    Eliminar proyecto
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-error">
                      Esto borra el proyecto completo: todas sus boletas, ítems, historial, etapas y partidas, sin poder deshacerlo.
                      Escribe <span className="font-semibold">{proyectoSeleccionado.nombre}</span> para confirmar.
                    </p>
                    <input
                      type="text"
                      value={confirmacionNombreProyecto}
                      onChange={(e) => setConfirmacionNombreProyecto(e.target.value)}
                      placeholder="Nombre del proyecto"
                      className="w-full border-2 border-error px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEliminandoProyecto(false); setConfirmacionNombreProyecto('') }}
                        className="flex-1 border-2 border-tinta py-2 text-xs text-gris-medio"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleEliminarProyecto}
                        disabled={borrandoProyecto || confirmacionNombreProyecto.trim() !== proyectoSeleccionado.nombre}
                        className="flex-1 bg-red-600 text-white py-2 text-xs font-semibold disabled:opacity-40 border-2 border-tinta shadow-hard-sm"
                      >
                        {borrandoProyecto ? 'Eliminando...' : 'Eliminar definitivamente'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      )}

      {tab === 'cuenta' && usuarioActual && (
        <div className="px-4 py-4 space-y-4">
          {/* Datos de la cuenta */}
          <div className=" border-2 border-tinta p-4 bg-white shadow-hard-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide">Nombre de la empresa</p>
              {puedeGestionarUsuarios && !editandoNombreCuenta && (
                <button onClick={() => setEditandoNombreCuenta(true)} className="text-xs text-dorado-link font-medium">✏ Editar</button>
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
                  className="flex-1 border-2 border-tinta px-3 py-2 text-sm"
                />
                <button onClick={guardarNombreCuenta} className="bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta px-3 text-sm font-medium">Guardar</button>
              </div>
            ) : (
              <p className="text-sm text-gris-medio">{cuenta?.nombre}</p>
            )}
          </div>

          {/* Crear contraseña */}
          <div className=" border-2 border-tinta p-4 bg-white shadow-hard-sm">
            <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide mb-1">Contraseña de acceso</p>
            <p className="text-xs text-gris-texto mb-3">Acá defines la contraseña con la que vas a entrar la próxima vez. Si es tu primer ingreso, créala ahora; si ya tenías una, puedes cambiarla cuando quieras.</p>
            <div className="space-y-2">
              <input
                type="password"
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                placeholder="Nueva contraseña"
                className="w-full border-2 border-tinta px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                placeholder="Confirmar contraseña"
                className="w-full border-2 border-tinta px-3 py-2 text-sm"
              />
              {passwordMensaje && <p className="text-xs text-gris-medio">{passwordMensaje}</p>}
              <button
                onClick={handleCrearPassword}
                disabled={guardandoPassword || !nuevaPassword || !confirmarPassword}
                className="w-full bg-tinta text-dorado py-2 text-sm font-semibold disabled:opacity-40 border-2 border-tinta shadow-hard-sm"
              >
                {guardandoPassword ? 'Guardando...' : 'Crear contraseña'}
              </button>
            </div>
          </div>

          {puedeGestionarUsuarios && (
            <>
              {/* Usuarios */}
              <div className=" border-2 border-tinta p-4 bg-white shadow-hard-sm">
                <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide mb-3">Usuarios</p>
                <div className="space-y-1.5 mb-3">
                  {usuariosCuenta.map((u) => (
                    <div key={u.id} className="flex items-center justify-between py-2 border-b-2 border-tinta last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-tinta truncate">{u.email}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-gris-texto uppercase">{u.rol}</span>
                          {!u.activo && (
                            <span className="text-[10px] bg-panel text-gris-medio px-1.5 py-0.5 rounded-full">Inactivo</span>
                          )}
                        </div>
                      </div>
                      {u.rol !== 'super_admin' && (
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <button onClick={() => abrirEdicionUsuario(u)} className="text-xs text-dorado-link font-medium">Editar</button>
                          <button onClick={() => handleDarDeBaja(u)} className="text-xs text-gris-texto font-medium">
                            {u.activo ? 'Dar de baja' : 'Reactivar'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Invitar usuario */}
              <div className=" border-2 border-tinta p-4 bg-white shadow-hard-sm">
                <p className="text-xs font-semibold text-gris-texto uppercase tracking-wide mb-3">Invitar usuario</p>
                <div className="space-y-2">
                  <input
                    type="email"
                    value={emailInvitar}
                    onChange={(e) => setEmailInvitar(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full border-2 border-tinta px-3 py-2 text-sm"
                  />
                  <select
                    value={rolInvitar}
                    onChange={(e) => setRolInvitar(e.target.value as 'admin' | 'usuario')}
                    className="w-full border-2 border-tinta px-3 py-2 text-sm bg-white"
                  >
                    <option value="usuario">Usuario</option>
                    <option value="admin">Admin</option>
                  </select>

                  <div>
                    <p className="text-[10px] font-semibold text-gris-texto uppercase tracking-wide mb-1.5">Permisos</p>
                    <div className="space-y-1">
                      {PERMISOS.map((p) => (
                        <label
                          key={p.key}
                          className="flex items-center justify-between py-1 border-b-2 border-tinta last:border-0"
                        >
                          <span className="text-sm text-gris-medio">{p.label}</span>
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
                    className="w-full bg-dorado border-2 border-tinta shadow-hard-sm font-bold text-tinta py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    {invitando ? 'Generando...' : 'Invitar (genera link)'}
                  </button>

                  {linkInvitacion && (
                    <div className="bg-panel border-2 border-tinta p-3 space-y-2 shadow-hard-sm">
                      <p className="text-xs text-gris-medio">Copia este link y mándaselo a la persona invitada:</p>
                      <p className="text-xs text-gris-medio break-all">{linkInvitacion}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigator.clipboard.writeText(linkInvitacion)}
                          className="flex-1 bg-tinta text-dorado py-1.5 text-xs font-semibold border-2 border-tinta shadow-hard-sm"
                        >
                          Copiar link
                        </button>
                        <button
                          onClick={() => setLinkInvitacion(null)}
                          className="text-xs text-gris-texto px-2"
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {invitaciones.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] text-gris-texto uppercase">Pendientes</p>
                    {invitaciones.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between py-1">
                        <p className="text-sm text-gris-medio">{inv.email} <span className="text-xs text-gris-texto">({inv.rol})</span></p>
                        <button onClick={() => handleCancelarInvitacion(inv.id)} className="text-xs text-gris-texto">Cancelar</button>
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

export default function Config() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-gris-texto text-sm">Cargando...</p></div>}>
      <ConfigContenido />
    </Suspense>
  )
}
