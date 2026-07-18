import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { imagen_base64, media_type } = await req.json()
    if (!imagen_base64) {
      return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `Evalúas rápidamente si una foto de una boleta o factura se ve lo suficientemente legible para poder extraer sus datos (proveedor, ítems, precios, total) más adelante. No extraigas los datos, solo evalúa la calidad de la imagen: enfoque/nitidez, iluminación, si se ve completa y encuadrada, y si el texto se alcanza a leer.

Responde SOLO con este JSON:
{
  "calidad_suficiente": true o false,
  "calidad_percibida": número entre 0 y 1,
  "motivo": string breve en español explicando el problema SOLO si calidad_suficiente es false (ej: "la foto se ve borrosa", "falta luz, se ve muy oscura", "la boleta está cortada, no se ve completa"). Si calidad_suficiente es true, "motivo" va null.
}`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: imagen_base64 } },
          { type: 'text', text: 'Evalúa la calidad de esta foto.' },
        ],
      }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Respuesta inesperada de la IA' }, { status: 500 })
    }
    const texto = textBlock.text.trim()
    const inicio = texto.indexOf('{')
    const fin = texto.lastIndexOf('}')
    if (inicio === -1 || fin === -1) {
      return NextResponse.json({ error: 'Respuesta inesperada de la IA' }, { status: 500 })
    }
    const resultado = JSON.parse(texto.slice(inicio, fin + 1))
    return NextResponse.json(resultado)
  } catch (err) {
    console.error('[verificar-calidad-imagen]', err)
    return NextResponse.json({ error: 'No se pudo verificar la calidad de la imagen' }, { status: 500 })
  }
}
