begin;
-- Intentionally separate from migrations. Safe to re-run: no deletes, no users,
-- no points, no overwriting existing examples or subsequent moderation changes.
insert into public.categories(id, slug, name) values
  ('10000000-0000-4000-8000-000000000001','alumbrado','Alumbrado'),
  ('10000000-0000-4000-8000-000000000002','residuos','Residuos'),
  ('10000000-0000-4000-8000-000000000003','baches','Baches'),
  ('10000000-0000-4000-8000-000000000004','veredas','Veredas'),
  ('10000000-0000-4000-8000-000000000005','arbolado','Arbolado'),
  ('10000000-0000-4000-8000-000000000006','agua','Agua'),
  ('10000000-0000-4000-8000-000000000007','electricidad','Electricidad'),
  ('10000000-0000-4000-8000-000000000008','gas','Gas'),
  ('10000000-0000-4000-8000-000000000009','otros','Otros')
on conflict (slug) do nothing;

insert into public.claims(id, author_id, category_id, title, description, address,
  neighborhood, status, moderation_status, is_demo, created_at)
select v.id::uuid, null, cat.id, v.title, v.description, v.address, v.neighborhood,
  v.status::public.claim_status, 'aprobado', true, v.created_at::timestamptz
from (values
  ('20000000-0000-4000-8000-000000000001','alumbrado','Una cuadra que necesita más luz','Dos luminarias no encienden por la noche. Ejemplo ficticio, sin envío a organismos.','Güemes al 2300','Pichincha','en_tratamiento','2026-10-23T12:00:00Z'),
  ('20000000-0000-4000-8000-000000000002','residuos','Residuos junto al contenedor','Se acumularon bolsas alrededor del contenedor. Situación inventada para esta demo.','San Juan al 1200','Centro','publicado','2026-10-23T11:00:00Z'),
  ('20000000-0000-4000-8000-000000000003','baches','Bache en la esquina','Un bache dificulta el paso de bicicletas y vehículos. Ejemplo ficticio, sin envío a organismos.','Mendoza y Cafferata','Echesortu','publicado','2026-10-22T12:00:00Z'),
  ('20000000-0000-4000-8000-000000000004','veredas','Vereda reparada, paso más seguro','Ejemplo de un reclamo con estado resuelto. No corresponde a una reparación real.','Entre Ríos al 1900','Abasto','resuelto','2026-10-21T12:00:00Z'),
  ('20000000-0000-4000-8000-000000000005','arbolado','Ramas sobre la senda peatonal','Ramas bajas obstruyen parte de la vereda. Reclamo ficticio de arbolado urbano.','Jujuy al 2400','Pichincha','en_tratamiento','2026-10-21T11:00:00Z'),
  ('20000000-0000-4000-8000-000000000006','agua','Pérdida de agua en la calle','Se observa agua sobre la calzada en este ejemplo inventado. No representa un reporte real.','Eva Perón al 8000','Fisherton','publicado','2026-10-20T12:00:00Z'),
  ('20000000-0000-4000-8000-000000000007','electricidad','Corte de suministro en la cuadra','Ejemplo ficticio de una interrupción de electricidad en el barrio. No representa un reporte real.','Bv. Rondeau al 2100','Alberdi','en_tratamiento','2026-10-20T11:00:00Z'),
  ('20000000-0000-4000-8000-000000000008','gas','Consulta por suministro de gas','Consulta inventada sobre el suministro de gas, incluida para mostrar la categoría.','Av. Alberdi al 900','Arroyito','publicado','2026-10-19T12:00:00Z'),
  ('20000000-0000-4000-8000-000000000009','otros','Cartel de la plaza deteriorado','Ejemplo ficticio de señalética deteriorada en un espacio público. No representa un reporte real.','Plaza Sarmiento','Centro','resuelto','2026-10-18T12:00:00Z')
) as v(id, slug, title, description, address, neighborhood, status, created_at)
join public.categories cat on cat.slug = v.slug
on conflict (id) do nothing;

insert into public.claim_history(claim_id, new_status, public_note)
  select c.id, c.status, 'Dato ficticio cargado por el seed de demostración; no representa una intervención real.'
  from public.claims c where c.id in (
    '20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000006',
    '20000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000008',
    '20000000-0000-4000-8000-000000000009'
  ) and c.is_demo and not exists (select 1 from public.claim_history h where h.claim_id = c.id);
commit;
