'use client'

import { useState, useEffect } from 'react'
import { getUsuarioActual, getNotificaciones, marcarNotificacionLeida, marcarTodasNotificacionesLeidas } from '@/lib/supabase/db'
import type { Notificacion } from '@/lib/types'

const ICONO_TIPO: Record<string, string> = {
  solicitud_aprobacion: '📤',
  boleta_aprobada: '✅',
  boleta_rechazada: '⛔',
}

export default function Avisos() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(true)
  const [usuarioId, setUsuarioId] = useState<string | null>(null)

  useEffect(() => {
    getUsuarioActual().then(async (u) => {
      if (!u) { setLoading(false); return }
      setUsuarioId(u.id)
      setNotificaciones(await getNotificaciones(u.id))
      setLoading(false)
    })
  }, [])

  async function marcarLeida(id: string) {
    setNotificaciones((prev) => prev.map((n) => n.id === id ? { ...n, leida: true } : n))
    await marcarNotificacionLeida(id)
  }

  async function marcarTodas() {
    if (!usuarioId) return
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })))
    await marcarTodasNotificacionesLeidas(usuarioId)
  }

  const noLeidas = notificaciones.filter((n) => !n.leida).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-gris-texto text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="px-4 pt-4 flex items-center justify-between">
        <p className="text-xs text-gris-texto">{noLeidas} sin leer</p>
        {noLeidas > 0 && (
          <button onClick={marcarTodas} className="text-xs text-dorado-link font-bold">Marcar todas como leídas</button>
        )}
      </div>

      <div className="px-4 py-4 space-y-2">
        {notificaciones.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm font-medium text-gris-medio">Sin notificaciones</p>
          </div>
        )}
        {notificaciones.map((n) => (
          <button
            key={n.id}
            onClick={() => !n.leida && marcarLeida(n.id)}
            className={`w-full text-left border-2 p-3 flex items-start gap-2.5 ${n.leida ? 'border-tinta' : 'border-tinta bg-crema-header'}`}
          >
            <span className="text-lg shrink-0">{ICONO_TIPO[n.tipo] ?? '🔔'}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${n.leida ? 'text-gris-medio' : 'text-tinta font-medium'}`}>{n.mensaje}</p>
              <p className="text-[10px] text-gris-texto mt-0.5">{formatFechaHora(n.created_at)}</p>
            </div>
            {!n.leida && <span className="w-2 h-2 bg-tinta rounded-full shrink-0 mt-1.5" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
