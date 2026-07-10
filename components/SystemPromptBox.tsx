import Link from 'next/link'
import type { Proyecto } from '@/lib/types'

export default function SystemPromptBox({ proyecto }: { proyecto: Proyecto }) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: '#EEEDFE', borderColor: '#AFA9EC' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold" style={{ color: '#534AB7' }}>
          🤖 Instrucciones de proyecto — {proyecto.nombre}
        </p>
        <Link href="/config" className="text-[11px] underline" style={{ color: '#534AB7' }}>
          ✏ Editar
        </Link>
      </div>
      {proyecto.system_prompt ? (
        <p className="text-xs leading-relaxed" style={{ color: '#534AB7' }}>
          {proyecto.system_prompt}
        </p>
      ) : (
        <p className="text-xs italic text-gray-400">Sin instrucciones definidas</p>
      )}
    </div>
  )
}
