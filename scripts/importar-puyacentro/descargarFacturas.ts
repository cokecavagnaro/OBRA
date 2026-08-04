import fs from 'fs'
import path from 'path'

interface FacturaListado {
  numero: string
  id: string
  token: string
}

const DIR_PDFS = path.join(__dirname, 'pdfs')

export function construirUrlPdf(id: string, token: string): string {
  return `https://www.puyacentro.cl/my/invoices/${id}?access_token=${token}&report_type=pdf&download=true`
}

async function descargarFactura(factura: FacturaListado): Promise<void> {
  const destino = path.join(DIR_PDFS, `${factura.numero}.pdf`)
  if (fs.existsSync(destino)) {
    console.log(`  ${factura.numero}: ya existe, se salta`)
    return
  }
  const url = construirUrlPdf(factura.id, factura.token)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Factura ${factura.numero}: HTTP ${res.status} al descargar ${url}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destino, buffer)
  console.log(`  ${factura.numero}: descargada (${buffer.byteLength} bytes)`)
}

async function main() {
  const listado: FacturaListado[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'facturas.json'), 'utf-8')
  )
  fs.mkdirSync(DIR_PDFS, { recursive: true })
  console.log(`Descargando ${listado.length} facturas...`)
  for (const factura of listado) {
    await descargarFactura(factura)
  }
  console.log('Listo.')
}

// Guard para que importar este archivo desde un test (para probar
// construirUrlPdf) no dispare descargas reales — solo corre main() cuando
// el archivo se ejecuta directamente (`tsx descargarFacturas.ts`).
if (process.argv[1]?.endsWith('descargarFacturas.ts')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
