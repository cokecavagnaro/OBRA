'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCLP } from '@/lib/mock'
import { getDocumentosCabeceras } from '@/lib/supabase/db'
import type { DocumentoCabecera } from '@/lib/types'

const BADGE_ESTADO: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  aprobado: 'bg-green-100 text-green-700',
  rechazado: 'bg-red-100 text-red-700',
}

const LABEL_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
}

export default function DocumentosPage() {
  const [documentos, setDocumentos] = useState<DocumentoCabecera[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocumentosCabeceras().then((resultado) => {
      setDocumentos(resultado)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-white"><p className="text-sm text-gray-400">Cargando documentos...</p></div>
  }

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="border-b border-gray-100 px-4 pb-4 pt-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Volver al inicio"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900">Documentos</h1>
            <p className="mt-0.5 text-xs text-gray-400">Registro completo de la empresa</p>
          </div>
          <div className="rounded-xl bg-slate-900 px-3 py-2 text-center text-white">
            <p className="text-lg font-bold leading-none">{documentos.length.toLocaleString('es-CL')}</p>
            <p className="mt-1 text-[8px] font-bold uppercase tracking-wide text-white/70">Total</p>
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">Más recientes primero</p>

        {documentos.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl">🧾</p>
            <p className="mt-3 text-sm text-gray-500">Aún no hay documentos registrados</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documentos.map((documento) => (
              <Link
                key={documento.id}
                href={`/documentos/${documento.id}`}
                className="block rounded-xl border border-gray-100 p-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 active:bg-blue-50"
              >
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${documento.imagen_url ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l4 4v14H7a2 2 0 01-2-2V5a2 2 0 012-2z" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 13h6M9 17h6" /></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{documento.proveedor || 'Sin proveedor'}</p>
                      <p className="shrink-0 text-sm font-bold text-gray-900">{formatCLP(documento.total)}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium text-blue-600">{documento.proyecto?.nombre || 'Proyecto sin nombre'}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 text-[10px] text-gray-400">
                        <span>{formatFechaDocumento(documento.fecha_boleta)}</span>
                        <span className="mx-1">·</span>
                        <span>Registrado {formatFechaRegistro(documento.created_at)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${BADGE_ESTADO[documento.estado_aprobacion] ?? 'bg-gray-100 text-gray-600'}`}>
                          {LABEL_ESTADO[documento.estado_aprobacion] ?? documento.estado_aprobacion}
                        </span>
                        <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function formatFechaDocumento(fecha: string): string {
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFechaRegistro(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}
