-- Presupuesto opcional por proyecto, etapa y partida, para comparar contra
-- el gasto real. Sin validación cruzada entre niveles — cada uno es
-- independiente y opcional.
alter table proyectos add column if not exists presupuesto numeric;
alter table etapas add column if not exists presupuesto numeric;
alter table partidas add column if not exists presupuesto numeric;
