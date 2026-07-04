const LADO_MAXIMO = 1600
const CALIDAD_JPEG = 0.8

export async function normalizarImagenParaSubida(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  const bitmap = await createImageBitmap(file)

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
