-- OPTIONAL MANUAL OPERATION, separate from migrations and seed.
-- Run only this preview first, then inspect every proposed community publication.
-- Approved claims expose their permitted text, attachment metadata and associated
-- photographs to visitors under the existing RLS/Storage read policies.
select id, title, status, is_demo, created_at
from public.claims
where moderation_status = 'pendiente'
order by created_at, id;

-- After reviewing the preview, run the following block separately if desired.
-- It changes only pending moderation: management stages, rejected/hidden claims,
-- authors, entities and demo flags are preserved. No validation RPC or points.
-- The normal updated_at trigger still records the moderation change.
/*
begin;
update public.claims
set moderation_status = 'aprobado'
where moderation_status = 'pendiente'
returning id, title, status, moderation_status;
commit;
*/
