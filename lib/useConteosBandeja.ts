'use client'

import { useState, useEffect, useCallback } from 'react'
import { getAllGastos, getUsuarioActual, getPermisosOverrides, getNotificaciones } from './supabase/db'
import { tienePermiso } from './permisos'

export interface ConteosBandeja {
  items: number
  porAprobar: number
  avisos: number
}

// Números que se muestran en la barra inferior y en las pestañas de la
// Bandeja: ítems por revisar, boletas por aprobar (las de toda la cuenta si
// el usuario aprueba; si no, solo sus rechazadas) y notificaciones sin leer.
export function useConteosBandeja(recargarCuando: string, activo = true): ConteosBandeja {
  const [conteos, setConteos] = useState<ConteosBandeja>({ items: 0, porAprobar: 0, avisos: 0 })

  const recargar = useCallback(() => {
    getUsuarioActual().then(async (usuario) => {
      if (!usuario) return
      const overrides = await getPermisosOverrides(usuario.id)
      const esAprobador = tienePermiso(usuario, overrides, 'approve_boletas')
      const [gastos, notificaciones] = await Promise.all([getAllGastos(), getNotificaciones(usuario.id)])
      setConteos({
        items: gastos.flatMap((g) => g.items ?? []).filter((i) => i.estado === 'pendiente').length,
        porAprobar: esAprobador
          ? gastos.filter((g) => g.estado_aprobacion === 'pendiente').length
          : gastos.filter((g) => g.estado_aprobacion === 'rechazado' && g.solicitante_id === usuario.id).length,
        avisos: notificaciones.filter((n) => !n.leida).length,
      })
    })
  }, [])

  useEffect(() => {
    if (activo) recargar()
  }, [activo, recargar, recargarCuando])

  return conteos
}
