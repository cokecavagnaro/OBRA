// Carga .env.test.local (mismo patrón de parseo manual que
// scripts/migrar-imagenes-storage.js, sin dotenv) y expone las credenciales
// QA_* + helpers de cliente Supabase, para no duplicar el parser en cada
// script nuevo de scripts/qa/.
//
// Las variables van prefijadas QA_ (en vez de reusar los nombres estándar
// NEXT_PUBLIC_SUPABASE_URL/etc.) para que nunca se puedan confundir con las
// de producción, aunque hoy apunten al mismo proyecto Supabase.

const fs = require('fs')
const nodePath = require('path')
const { createClient } = require('@supabase/supabase-js')

const envPath = nodePath.join(__dirname, '..', '..', '.env.test.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Falta ${name} en .env.test.local (o en el entorno del job de CI).`)
  }
  return value
}

function createAdminClient() {
  return createClient(requireEnv('QA_SUPABASE_URL'), requireEnv('QA_SUPABASE_SERVICE_ROLE_KEY'))
}

function createAnonClient() {
  return createClient(requireEnv('QA_SUPABASE_URL'), requireEnv('QA_SUPABASE_ANON_KEY'))
}

module.exports = { requireEnv, createAdminClient, createAnonClient }
