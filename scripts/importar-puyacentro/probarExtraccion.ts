import fs from 'fs'
import { PDFParse } from 'pdf-parse'

async function main() {
  const ruta = process.argv[2]
  if (!ruta) {
    console.error('Uso: tsx scripts/importar-puyacentro/probarExtraccion.ts <ruta-al-pdf>')
    process.exit(1)
  }
  const buffer = fs.readFileSync(ruta)
  const parser = new PDFParse({ data: buffer })
  const resultado = await parser.getText()
  await parser.destroy()
  console.log('--- TEXTO CRUDO ---')
  console.log(resultado.text)
  console.log('--- FIN ---')
}

main()
