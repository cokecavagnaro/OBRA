import Anthropic from '@anthropic-ai/sdk'
import { parsearMontoCLP } from './montos'

let clienteAnthropic: Anthropic | null = null
function getClient(): Anthropic {
  if (!clienteAnthropic) clienteAnthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return clienteAnthropic
}

const MODELO = 'claude-haiku-4-5-20251001'

export interface DatosIngresoLeidos {
  remitente: string
  cuenta_destino: string
  monto: number
  fecha: string
}

export interface ClasificacionDocumento {
  tipo: 'gasto' | 'ingreso'
  confianza: number
  ingreso?: DatosIngresoLeidos
}

// Decide si la imagen es un comprobante de transferencia que ENTRA al
// proyecto (ingreso) o cualquier otro documento (boleta, factura, pago a un
// tercero = gasto). Se decide por lo que el documento dice, no por
// aritmética: el prompt solo pide COPIAR remitente, cuenta y monto impresos,
// igual que el análisis de boletas (nunca inventar un dato).
const systemPrompt = `Eres un asistente que clasifica documentos de una constructora en Chile. Mira la imagen y decide si es:

- "ingreso": un comprobante de TRANSFERENCIA DE DINERO que ENTRA a la cuenta de la empresa (el cliente o un inversionista le paga o le aporta dinero). Señales: "transferencia exitosa/recibida", "abono", "depósito", un remitente (quien transfiere) y una cuenta de destino.
- "gasto": cualquier otro caso. Boletas, facturas, notas de venta, y también comprobantes de transferencia donde la empresa PAGA a un tercero (proveedor, trabajador). Si dudas entre ambos, elige "gasto".

Responde SOLO con este JSON:
{
  "tipo": "ingreso" o "gasto",
  "confianza": número entre 0 y 1,
  "remitente": quien transfirió, tal como está impreso. "" si el documento no es un ingreso o no se lee con confianza. Nunca inventes un nombre.
  "cuenta_destino": cuenta a la que se transfirió, tal como está impresa (banco, tipo y/o terminación, ej. "Cuenta Vista ···4821"). "" si no se lee con confianza. Nunca inventes dígitos.
  "monto": el monto transferido, copiado tal cual está impreso como TEXTO entre comillas con sus puntos y comas (ej. "$6.000.000"). null si no se lee. NUNCA lo calcules.
  "fecha": fecha de la transferencia en formato YYYY-MM-DD, o "" si no se lee con confianza.
}`

function construirBloque(imagenBase64: string, mediaType: string): Anthropic.ContentBlockParam {
  if (mediaType === 'application/pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imagenBase64 } }
  }
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imagenBase64 },
  }
}

export function interpretarClasificacion(crudo: Record<string, unknown>): ClasificacionDocumento {
  const confianza = typeof crudo.confianza === 'number' ? Math.min(1, Math.max(0, crudo.confianza)) : 0
  const monto = parsearMontoCLP(crudo.monto)
  // Solo se acepta como ingreso si la IA lo afirma Y trae un monto legible:
  // un "ingreso" sin monto no se puede guardar ni verificar, y es más seguro
  // tratarlo como documento común para que el usuario lo revise.
  if (crudo.tipo === 'ingreso' && monto && monto > 0) {
    return {
      tipo: 'ingreso',
      confianza,
      ingreso: {
        remitente: typeof crudo.remitente === 'string' ? crudo.remitente.trim() : '',
        cuenta_destino: typeof crudo.cuenta_destino === 'string' ? crudo.cuenta_destino.trim() : '',
        monto,
        fecha: typeof crudo.fecha === 'string' ? crudo.fecha : '',
      },
    }
  }
  return { tipo: 'gasto', confianza }
}

export async function clasificarDocumento(imagenBase64: string, mediaType: string): Promise<ClasificacionDocumento> {
  const response = await getClient().messages.create({
    model: MODELO,
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: 'user', content: [construirBloque(imagenBase64, mediaType), { type: 'text', text: 'Clasifica este documento.' }] }],
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Respuesta inesperada de la IA')
  const texto = textBlock.text
  const inicio = texto.indexOf('{')
  const fin = texto.lastIndexOf('}')
  if (inicio === -1 || fin === -1) throw new Error('Respuesta inesperada de la IA')
  return interpretarClasificacion(JSON.parse(texto.slice(inicio, fin + 1)))
}
