import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import path from 'path'

// Corre la migración REAL (027_ingresos.sql) en un Postgres en memoria, con
// tablas mínimas de apoyo (cuentas, usuarios, proyectos) y una simulación de
// auth.uid(), para comprobar la estructura, las restricciones y el aislamiento
// por cuenta (RLS). No toca ninguna base de datos real.

const CUENTA_A = '11111111-1111-1111-1111-111111111111'
const CUENTA_B = '22222222-2222-2222-2222-222222222222'
const USUARIO_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USUARIO_A_BAJA = 'aaaaaaaa-0000-0000-0000-000000000000'
const USUARIO_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const PROYECTO_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const PROYECTO_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

let db: PGlite

async function como(usuarioId: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${usuarioId ?? ''}', false); set role ${usuarioId ? 'authenticated' : 'anon'};`)
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec('reset role')
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table cuentas (id uuid primary key);
    create table usuarios (id uuid primary key, cuenta_id uuid not null references cuentas(id), activo boolean not null default true);
    create table proyectos (id uuid primary key default gen_random_uuid(), cuenta_id uuid not null references cuentas(id), nombre text not null);
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
    grant select on usuarios, proyectos to authenticated;
    insert into cuentas values ('${CUENTA_A}'), ('${CUENTA_B}');
    insert into usuarios values ('${USUARIO_A}', '${CUENTA_A}', true), ('${USUARIO_A_BAJA}', '${CUENTA_A}', false), ('${USUARIO_B}', '${CUENTA_B}', true);
    insert into proyectos values ('${PROYECTO_A}', '${CUENTA_A}', 'Casa A'), ('${PROYECTO_B}', '${CUENTA_B}', 'Casa B');
  `)
  await db.exec(readFileSync(path.resolve(__dirname, '../../supabase/migrations/027_ingresos.sql'), 'utf8'))
})

afterAll(async () => { await db.close() })

describe('migración 027: tabla ingresos', () => {
  it('guarda un ingreso válido con los valores por defecto esperados', async () => {
    const r = await db.query<{ origen: string; cuenta_destino: string; created_at: string }>(
      `insert into ingresos (proyecto_id, remitente, monto, fecha) values ($1, 'Inversiones Rojas SpA', 6000000, '2026-09-12') returning origen, cuenta_destino, created_at`, [PROYECTO_A])
    expect(r.rows[0].origen).toBe('manual')
    expect(r.rows[0].cuenta_destino).toBe('')
    expect(r.rows[0].created_at).toBeTruthy()
  })

  it('rechaza montos en cero o negativos', async () => {
    await expect(db.query(`insert into ingresos (proyecto_id, remitente, monto, fecha) values ($1, 'X', 0, '2026-09-01')`, [PROYECTO_A])).rejects.toThrow()
    await expect(db.query(`insert into ingresos (proyecto_id, remitente, monto, fecha) values ($1, 'X', -500, '2026-09-01')`, [PROYECTO_A])).rejects.toThrow()
  })

  it('solo acepta origen "manual" o "foto"', async () => {
    await db.query(`insert into ingresos (proyecto_id, remitente, monto, fecha, origen) values ($1, 'X', 1, '2026-09-01', 'foto')`, [PROYECTO_A])
    await expect(db.query(`insert into ingresos (proyecto_id, remitente, monto, fecha, origen) values ($1, 'X', 1, '2026-09-01', 'otro')`, [PROYECTO_A])).rejects.toThrow()
  })

  it('exige quién transfirió, fecha y un proyecto existente', async () => {
    await expect(db.query(`insert into ingresos (proyecto_id, monto, fecha) values ($1, 1, '2026-09-01')`, [PROYECTO_A])).rejects.toThrow()
    await expect(db.query(`insert into ingresos (proyecto_id, remitente, monto) values ($1, 'X', 1)`, [PROYECTO_A])).rejects.toThrow()
    await expect(db.query(`insert into ingresos (proyecto_id, remitente, monto, fecha) values (gen_random_uuid(), 'X', 1, '2026-09-01')`)).rejects.toThrow()
  })

  it('al borrar un proyecto se borran sus ingresos', async () => {
    const p = await db.query<{ id: string }>(`insert into proyectos (cuenta_id, nombre) values ($1, 'Temporal') returning id`, [CUENTA_A])
    await db.query(`insert into ingresos (proyecto_id, remitente, monto, fecha) values ($1, 'X', 1, '2026-09-01')`, [p.rows[0].id])
    await db.query(`delete from proyectos where id = $1`, [p.rows[0].id])
    const r = await db.query(`select count(*)::int as n from ingresos where proyecto_id = $1`, [p.rows[0].id])
    expect((r.rows[0] as { n: number }).n).toBe(0)
  })
})

describe('migración 027: aislamiento por cuenta (RLS)', () => {
  beforeAll(async () => {
    await db.exec(`delete from ingresos`)
    await db.query(`insert into ingresos (proyecto_id, remitente, monto, fecha) values ($1, 'Ingreso de A', 100, '2026-09-01'), ($2, 'Ingreso de B', 200, '2026-09-01')`, [PROYECTO_A, PROYECTO_B])
  })

  it('cada usuario ve solo los ingresos de los proyectos de su cuenta', async () => {
    const a = await como(USUARIO_A, 'select remitente from ingresos order by remitente')
    expect(a.rows).toEqual([{ remitente: 'Ingreso de A' }])
    const b = await como(USUARIO_B, 'select remitente from ingresos order by remitente')
    expect(b.rows).toEqual([{ remitente: 'Ingreso de B' }])
  })

  it('un usuario no puede registrar un ingreso en un proyecto de otra cuenta', async () => {
    await expect(como(USUARIO_A, `insert into ingresos (proyecto_id, remitente, monto, fecha) values ($1, 'Intruso', 1, '2026-09-01')`, [PROYECTO_B])).rejects.toThrow(/row-level security/i)
  })

  it('un usuario sí puede registrar y borrar ingresos de su propia cuenta', async () => {
    await como(USUARIO_A, `insert into ingresos (proyecto_id, remitente, monto, fecha) values ($1, 'Propio', 1, '2026-09-01')`, [PROYECTO_A])
    const borrado = await como(USUARIO_A, `delete from ingresos where remitente = 'Propio' returning id`)
    expect(borrado.rows).toHaveLength(1)
  })

  it('un usuario no puede borrar ni modificar ingresos de otra cuenta', async () => {
    const borrado = await como(USUARIO_A, `delete from ingresos where remitente = 'Ingreso de B' returning id`)
    expect(borrado.rows).toHaveLength(0)
    const editado = await como(USUARIO_A, `update ingresos set monto = 1 where remitente = 'Ingreso de B' returning id`)
    expect(editado.rows).toHaveLength(0)
    const intacto = await db.query(`select monto from ingresos where remitente = 'Ingreso de B'`)
    expect(Number((intacto.rows[0] as { monto: string | number }).monto)).toBe(200)
  })

  it('un usuario dado de baja ya no ve ni escribe ingresos, aunque su sesión siga viva', async () => {
    const r = await como(USUARIO_A_BAJA, 'select * from ingresos')
    expect(r.rows).toHaveLength(0)
    await expect(como(USUARIO_A_BAJA, `insert into ingresos (proyecto_id, remitente, monto, fecha) values ($1, 'X', 1, '2026-09-01')`, [PROYECTO_A])).rejects.toThrow()
  })

  it('sin sesión (anónimo) no se puede leer nada', async () => {
    await expect(como(null, 'select * from ingresos')).rejects.toThrow(/permission denied/i)
  })
})
