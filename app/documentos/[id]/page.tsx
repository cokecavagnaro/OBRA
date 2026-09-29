'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import FichaBoleta from '@/components/FichaBoleta'
import { getEtiquetas, getEtapas, getGastoPorId, getPartidas, getPermisosOverrides, getUsuarioActual } from '@/lib/supabase/db'
import type { Etapa, Gasto, Partida, PermissionOverride, Usuario } from '@/lib/types'

export default function DocumentoDetallePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [gasto, setGasto] = useState<Gasto | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [overrides, setOverrides] = useState<PermissionOverride[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [partidas, setPartidas] = useState<Partida[]>([])
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vigente = true

    async function cargar() {
      const [documento, usuarioActual] = await Promise.all([getGastoPorId(id), getUsuarioActual()])
      if (!vigente) return

      setGasto(documento)
      setUsuario(usuarioActual)

      if (documento) {
        const [etapasResultado, partidasResultado, etiquetasResultado, permisosResultado] = await Promise.all([
          getEtapas(documento.proyecto_id),
          getPartidas(documento.proyecto_id),
          getEtiquetas(documento.proyecto_id),
          usuarioActual ? getPermisosOverrides(usuarioActual.id) : Promise.resolve([]),
        ])
        if (!vigente) return
        setEtapas(etapasResultado)
        setPartidas(partidasResultado)
        setEtiquetas(etiquetasResultado)
        setOverrides(permisosResultado)
      }

      setLoading(false)
    }

    cargar()
    return () => { vigente = false }
  }, [id])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-white"><p className="text-sm text-gray-400">Cargando documento...</p></div>
  }

  if (!gasto) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <p className="text-sm font-semibold text-gray-700">Documento no encontrado</p>
        <button onClick={() => router.push('/documentos')} className="mt-3 text-sm font-medium text-blue-600">Volver al registro</button>
      </div>
    )
  }

  return (
    <FichaBoleta
      gasto={gasto}
      usuarioActual={usuario}
      overrides={overrides}
      etapas={etapas}
      partidas={partidas}
      etiquetasSugeridas={etiquetas}
      onActualizado={setGasto}
      onEliminado={() => router.replace('/documentos')}
      onCerrar={() => router.push('/documentos')}
      modoPagina
    />
  )
}
