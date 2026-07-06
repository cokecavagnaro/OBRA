-- Ejecutar manualmente en el editor SQL de Supabase.
-- Fase A: introduce el concepto de "cuenta" (empresa/titular) con usuarios y
-- roles, y mueve el aislamiento de datos de "por usuario individual"
-- (obras.user_id = auth.uid()) a "por cuenta" (todos los usuarios de la
-- misma cuenta ven las mismas obras/gastos).
--
-- Confirmado contra las políticas reales del proyecto (vía
-- `select * from pg_policies where schemaname='public'`): hoy cada tabla
-- tiene UNA política "for all" que compara contra auth.uid() = user_id
-- (directo en obras, vía EXISTS/join en las demás). Esta migración
-- reemplaza esas políticas exactas por el mismo patrón pero comparando
-- cuenta_id en vez de user_id.

-- ---------- Cuentas y usuarios ----------

create table cuentas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Mi empresa',
  created_at timestamptz default now()
);

create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  cuenta_id uuid references cuentas(id) on delete cascade,
  nombre text,
  email text,
  rol text check (rol in ('super_admin','admin','usuario')) default 'usuario',
  created_at timestamptz default now()
);

alter table obras add column if not exists cuenta_id uuid references cuentas(id);

-- Las tablas nuevas creadas por SQL no heredan automáticamente los permisos
-- de lectura del rol `authenticated` — sin este grant, cualquier política RLS
-- de otra tabla (ej. obras) que consulte `usuarios` por dentro falla con 403,
-- aunque los datos y la política estén bien.
grant select on usuarios to authenticated;
grant select on cuentas to authenticated;

-- ---------- Bootstrap automático al registrarse ----------
-- Todo usuario nuevo en auth.users arma su propia cuenta y queda como
-- super_admin de ella. (En Fase B se ajusta para que un usuario invitado
-- por un admin se una a una cuenta existente en vez de crear una nueva.)

create function public.handle_new_user()
returns trigger as $$
declare
  nueva_cuenta_id uuid;
begin
  insert into cuentas (nombre)
    values (coalesce(new.raw_user_meta_data->>'nombre_empresa', 'Mi empresa'))
    returning id into nueva_cuenta_id;
  insert into usuarios (id, cuenta_id, email, nombre, rol)
  values (new.id, nueva_cuenta_id, new.email, new.raw_user_meta_data->>'nombre', 'super_admin');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Backfill de usuarios/obras que ya existían ----------
-- Cada user_id distinto que ya tenía obras se vuelve super_admin de su
-- propia cuenta nueva, y esas obras quedan asignadas a esa cuenta.

do $$
declare
  r record;
  nueva_cuenta_id uuid;
begin
  for r in select distinct user_id from obras where user_id is not null loop
    if not exists (select 1 from usuarios where id = r.user_id) then
      insert into cuentas (nombre) values ('Mi empresa') returning id into nueva_cuenta_id;
      insert into usuarios (id, cuenta_id, email, rol)
        values (r.user_id, nueva_cuenta_id, (select email from auth.users where id = r.user_id), 'super_admin');
    else
      select cuenta_id into nueva_cuenta_id from usuarios where id = r.user_id;
    end if;
    update obras set cuenta_id = nueva_cuenta_id where user_id = r.user_id;
  end loop;
end $$;

-- ---------- RLS: cuentas y usuarios ----------

alter table cuentas enable row level security;
alter table usuarios enable row level security;

create policy "usuarios ven su propia fila" on usuarios for select
  using (id = auth.uid());
create policy "usuarios ven su cuenta" on cuentas for select
  using (id = (select cuenta_id from usuarios where id = auth.uid()));

-- ---------- RLS: obras (scoping directo por cuenta_id) ----------
-- Reemplaza la política real "usuario ve sus obras" (auth.uid() = user_id)

drop policy "usuario ve sus obras" on obras;
create policy "usuarios de la cuenta acceden a sus obras" on obras for all
  using (cuenta_id = (select cuenta_id from usuarios where id = auth.uid()))
  with check (cuenta_id = (select cuenta_id from usuarios where id = auth.uid()));

-- ---------- RLS: etapas (scoping vía obra_id) ----------
-- Reemplaza la política real "usuario ve etapas de sus obras"

drop policy "usuario ve etapas de sus obras" on etapas;
create policy "usuarios de la cuenta acceden a etapas de sus obras" on etapas for all
  using (exists (
    select 1 from obras where obras.id = etapas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ))
  with check (exists (
    select 1 from obras where obras.id = etapas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ));

-- ---------- RLS: partidas (scoping vía obra_id) ----------
-- Reemplaza la política real "usuario ve partidas de sus obras"

drop policy "usuario ve partidas de sus obras" on partidas;
create policy "usuarios de la cuenta acceden a partidas de sus obras" on partidas for all
  using (exists (
    select 1 from obras where obras.id = partidas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ))
  with check (exists (
    select 1 from obras where obras.id = partidas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ));

-- ---------- RLS: gastos (scoping vía obra_id) ----------
-- Reemplaza la política real "usuario ve gastos de sus obras"

drop policy "usuario ve gastos de sus obras" on gastos;
create policy "usuarios de la cuenta acceden a gastos de sus obras" on gastos for all
  using (exists (
    select 1 from obras where obras.id = gastos.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ))
  with check (exists (
    select 1 from obras where obras.id = gastos.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ));

-- ---------- RLS: items_gasto (scoping vía gasto_id -> obra_id) ----------
-- Reemplaza la política real "usuario ve items de sus gastos"

drop policy "usuario ve items de sus gastos" on items_gasto;
create policy "usuarios de la cuenta acceden a items de sus gastos" on items_gasto for all
  using (exists (
    select 1 from gastos join obras on obras.id = gastos.obra_id
    where gastos.id = items_gasto.gasto_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ))
  with check (exists (
    select 1 from gastos join obras on obras.id = gastos.obra_id
    where gastos.id = items_gasto.gasto_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ));

-- ---------- RLS: clasificaciones_aprendidas (endurecer de "authenticated" a "por cuenta") ----------
-- Hoy solo chequea auth.role() = 'authenticated' (cualquiera ve el aprendizaje
-- de cualquier obra); se aprovecha esta migración para acotarlo también por cuenta.

drop policy "usuarios autenticados leen aprendizaje" on clasificaciones_aprendidas;
drop policy "usuarios autenticados escriben aprendizaje" on clasificaciones_aprendidas;
drop policy "usuarios autenticados actualizan aprendizaje" on clasificaciones_aprendidas;
create policy "usuarios de la cuenta acceden a aprendizaje de sus obras" on clasificaciones_aprendidas for all
  using (exists (
    select 1 from obras where obras.id = clasificaciones_aprendidas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ))
  with check (exists (
    select 1 from obras where obras.id = clasificaciones_aprendidas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
  ));
