const LADO_MAXIMO = 1600
const CALIDAD_JPEG = 0.8

function esHeic(file: File): boolean {
  return /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

async function convertirHeicAJpeg(file: File): Promise<Blob> {
  const heic2any = (await import('heic2any')).default
  const resultado = await heic2any({ blob: file, toType: 'image/jpeg', quality: CALIDAD_JPEG })
  return Array.isArray(resultado) ? resultado[0] : resultado
}

// El iPhone guarda las fotos de la galería en HEIC por defecto (la cámara del
// navegador sí entrega JPEG directo, así que esto solo aplica a "Subir desde
// galería"). Safari/iOS sabe decodificar HEIC de forma nativa (usa el
// decodificador propio de Apple, que maneja bien Portrait/Live Photos) — hay
// que probar eso primero. heic2any (decodifica vía WASM en el navegador) es
// el respaldo para navegadores sin soporte nativo (Chrome/Firefox de
// escritorio), pero su decodificador es más limitado y puede fallar con
// "Could not parse HEIF file" en algunas fotos (típicamente Retrato/Live
// Photo, que traen datos de profundidad extra dentro del HEIC) que el
// decodificador nativo sí lee sin problema.
async function decodificarImagen(file: File): Promise<ImageBitmap> {
  if (!esHeic(file)) return createImageBitmap(file)
  try {
    return await createImageBitmap(file)
  } catch {
    const jpeg = await convertirHeicAJpeg(file)
    return createImageBitmap(jpeg)
  }
}

export async function normalizarImagenParaSubida(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  const bitmap = await decodificarImagen(file)

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * escala)
  const height = Math.round(bitmap.height * escala)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG)
  )
  if (!blob) throw new Error('No se pudo procesar la imagen')

  const dataUrl = canvas.toDataURL('image/jpeg', CALIDAD_JPEG)

  return { blob, dataUrl }
}
