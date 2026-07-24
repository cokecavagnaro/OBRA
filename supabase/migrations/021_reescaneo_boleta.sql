-- Permite loguear un re-escaneo de boleta como evento de gasto_eventos
-- (migración 017), reutilizando esa misma tabla en vez de crear una nueva:
-- ya guarda gasto_id, usuario_id/usuario_email, created_at y comentario.
alter table gasto_eventos drop constraint gasto_eventos_accion_check;
alter table gasto_eventos add constraint gasto_eventos_accion_check
  check (accion in ('solicitada', 'editada', 'aprobada', 'rechazada', 'reenviada', 'eliminada', 'reescaneada'));
