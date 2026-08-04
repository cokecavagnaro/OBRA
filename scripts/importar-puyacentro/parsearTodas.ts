import fs from 'fs'
import path from 'path'
import { PDFParse } from 'pdf-parse'
import { parsearTextoFactura, FacturaPuya } from '../../lib/importacion/parsearFacturaPuya'

const DIR_PDFS = path.join(__dirname, 'pdfs')

interface ProductoUnico {
  codigo: string
  descripcion: string
  apariciones: number
}

export function agruparProductosUnicos(facturas: FacturaPuya[]): ProductoUnico[] {
  const porCodigo = new Map<string, ProductoUnico>()
  for (const factura of facturas) {
    for (const item of factura.items) {
      const existente = porCodigo.get(item.codigo)
      if (existente) {
        existente.apariciones += 1
      } else {
        porCodigo.set(item.codigo, { codigo: item.codigo, descripcion: item.descripcion, apariciones: 1 })
      }
    }
  }
  return Array.from(porCodigo.values()).sort((a, b) => b.apariciones - a.apariciones)
}

async function main() {
  const archivos = fs.readdirSync(DIR_PDFS).filter((f) => f.endsWith('.pdf'))
  const facturas: FacturaPuya[] = []

  for (const archivo of archivos) {
    const numero = archivo.replace(/\.pdf$/, '')
    const buffer = fs.readFileSync(path.join(DIR_PDFS, archivo))
    const parser = new PDFParse({ data: buffer })
    const { text } = await parser.getText()
    await parser.destroy()
    try {
      const factura = parsearTextoFactura(text, numero)
      facturas.push(factura)
      console.log(`  ${numero}: OK — ${factura.items.length} ítems, total $${factura.total}`)
    } catch (err) {
      console.error(`  ${numero}: ERROR — ${(err as Error).message}`)
    }
  }

  fs.writeFileSync(
    path.join(__dirname, 'facturas-parseadas.json'),
    JSON.stringify(facturas, null, 2)
  )

  const productos = agruparProductosUnicos(facturas)
  fs.writeFileSync(
    path.join(__dirname, 'productos-unicos.json'),
    JSON.stringify(productos, null, 2)
  )

  console.log(`\n${facturas.length} facturas parseadas, ${productos.length} productos únicos:\n`)
  for (const p of productos) {
    console.log(`  [${p.codigo}] ${p.descripcion}  (${p.apariciones}x)`)
  }
}

if (process.argv[1]?.endsWith('parsearTodas.ts')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
