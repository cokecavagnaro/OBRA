import Link from 'next/link'
import type { Obra } from '@/lib/types'

export default function SystemPromptBox({ obra }: { obra: Obra }) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: '#EEEDFE', borderColor: '#AFA9EC' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold" style={{ color: '#534AB7' }}>
          🤖 Instrucciones de obra — {obra.nombre}
        </p>
        <Link href="/config" className="text-[11px] underline" style={{ color: '#534AB7' }}>
          ✏ Editar
        </Link>
      </div>
      {obra.system_prompt ? (
        <p className="text-xs leading-relaxed" style={{ color: '#534AB7' }}>
          {obra.system_prompt}
        </p>
      ) : (
        <p className="text-xs italic text-gray-400">Sin instrucciones definidas</p>
      )}
    </div>
  )
}
