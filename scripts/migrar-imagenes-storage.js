// Script de una sola vez: migra las boletas guardadas con imagen_url en base64
// (antes del fix de Storage) a un archivo real en el bucket "boletas", y
// actualiza el registro para que imagen_url apunte a la URL pública.
//
// Requiere haber corrido antes, en el SQL Editor de Supabase:
//   - supabase/migrations/009_storage_boletas.sql (crea el bucket + políticas)
//   - supabase/migrations/010_grants_service_role_gastos.sql (grants en gastos)
//
// Uso: node scripts/migrar-imagenes-storage.js

const fs = require('fs')
const nodePath = require('path')
const { createClient } = require('@supabase/supabase-js')

for (const line of fs.readFileSync(nodePath.join(__dirname, '..', '.env.local'), 'utf-8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const { data: gastos, error } = await admin
    .from('gastos')
    .select('id, obra_id, imagen_url, obras(cuenta_id)')
    .like('imagen_url', 'data:%')

  if (error) {
    console.error('Error consultando gastos:', error.message)
    process.exit(1)
  }

  if (!gastos || gastos.length === 0) {
    console.log('No hay boletas con imagen_url en base64. Nada que migrar.')
    return
  }

  console.log(`Encontradas ${gastos.length} boletas con imagen en base64.`)

  let migradas = 0
  let fallidas = 0

  for (const gasto of gastos) {
    const cuentaId = gasto.obras?.cuenta_id
    if (!cuentaId) {
      console.error(`✗ ${gasto.id}: no se pudo resolver cuenta_id (obra ${gasto.obra_id})`)
      fallidas++
      continue
    }

    const match = gasto.imagen_url.match(/^data:(image\/\w+);base64,(.+)$/)
    if (!match) {
      console.error(`✗ ${gasto.id}: imagen_url no tiene el formato data:image/...;base64,... esperado`)
      fallidas++
      continue
    }
    const [, contentType, base64] = match
    const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1]
    const buffer = Buffer.from(base64, 'base64')
    const path = `${cuentaId}/${gasto.obra_id}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await admin.storage.from('boletas').upload(path, buffer, { contentType })
    if (uploadError) {
      console.error(`✗ ${gasto.id}: error subiendo a Storage — ${uploadError.message}`)
      fallidas++
      continue
    }

    const { data: publicUrlData } = admin.storage.from('boletas').getPublicUrl(path)

    const { error: updateError } = await admin
      .from('gastos')
      .update({ imagen_url: publicUrlData.publicUrl })
      .eq('id', gasto.id)

    if (updateError) {
      console.error(`✗ ${gasto.id}: subida OK pero falló el update de imagen_url — ${updateError.message}`)
      fallidas++
      continue
    }

    console.log(`✓ ${gasto.id} → ${publicUrlData.publicUrl}`)
    migradas++
  }

  console.log(`\nListo. Migradas: ${migradas}. Fallidas: ${fallidas}.`)
}

main()
