'use client'

import { useState, useEffect } from 'react'
import { getUsuarioActual, getNotificaciones, marcarNotificacionLeida, marcarTodasNotificacionesLeidas } from '@/lib/supabase/db'
import type { Notificacion } from '@/lib/types'

const ICONO_TIPO: Record<string, string> = {
  solicitud_aprobacion: '📤',
  boleta_aprobada: '✅',
  boleta_rechazada: '⛔',
}

export default function Notificaciones() {
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
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 text-sm">Cargando...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-4 pt-12 pb-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Avisos</h1>
          <p className="text-xs text-gray-400 mt-0.5">{noLeidas} sin leer</p>
        </div>
        {noLeidas > 0 && (
          <button onClick={marcarTodas} className="text-xs text-blue-600 font-medium">Marcar todas como leídas</button>
        )}
      </div>

      <div className="px-4 py-4 space-y-2">
        {notificaciones.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm font-medium text-gray-600">Sin notificaciones</p>
          </div>
        )}
        {notificaciones.map((n) => (
          <button
            key={n.id}
            onClick={() => !n.leida && marcarLeida(n.id)}
            className={`w-full text-left rounded-xl border p-3 flex items-start gap-2.5 ${n.leida ? 'border-gray-100' : 'border-blue-100 bg-blue-50/40'}`}
          >
            <span className="text-lg shrink-0">{ICONO_TIPO[n.tipo] ?? '🔔'}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${n.leida ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>{n.mensaje}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{formatFechaHora(n.created_at)}</p>
            </div>
            {!n.leida && <span className="w-2 h-2 bg-blue-600 rounded-full shrink-0 mt-1.5" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function formatFechaHora(fecha: string): string {
  return new Date(fecha).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
