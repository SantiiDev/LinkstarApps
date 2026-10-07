-- ============================================================================
-- LINKSTAR — 0033: sentimiento, temas y palabras clave de cada reseña (fase 5)
-- ============================================================================
-- Un modelo (Gemini, desde services/api) lee el texto de cada reseña UNA vez y
-- guarda tres cosas:
--
--   sentiment  positive | neutral | negative — el tono general del texto
--   topics     de qué habla, cada tema con su propio tono:
--              [{"topic": "espera", "sentiment": "negative"}, ...]
--              Lista cerrada (abajo): un gráfico de «temas» necesita que la
--              misma cosa se llame igual en todas las reseñas.
--   keywords   hasta 8 palabras o frases cortas, en minúscula, tal como las
--              usó el cliente, cada una con SU tono:
--              [{"term": "lugar lindo", "sentiment": "positive"}, ...]
--              El tono va por palabra y no se hereda de la reseña: en «tardaron
--              una hora, una lástima porque el lugar es lindo» la reseña es
--              negativa y «lugar lindo» es un elogio. Heredarlo ponía «lugar
--              lindo» en la lista de quejas (visto en la primera prueba).
--
-- ── Sólo Business ───────────────────────────────────────────────────────────
-- Es una función del plan Business («Reportes de NPS, sentimiento y palabras
-- clave», 0013). El corte es doble, y los dos están acá:
--   - google_reviews_pending_analysis() sólo devuelve reseñas de
--     organizaciones con org_has_business(): no se gasta IA en las gratis. Si
--     una organización pasa a Business, sus reseñas viejas salen como pendientes
--     en la corrida siguiente — no hace falta un backfill aparte.
--   - El RLS de google_review_analysis exige Business para leer. Una
--     organización que baja a gratis conserva las filas, pero no las ve.
--
-- ── Se calcula una vez ──────────────────────────────────────────────────────
-- review_updated_time guarda el updated_time de la reseña que se analizó. Si el
-- cliente edita la reseña, su updated_time avanza y vuelve a salir pendiente.
-- Nada se recalcula al abrir una pantalla.
--
-- Las reseñas sin texto (sólo estrellas) no se analizan: no hay de qué sacar un
-- tema. Las pantallas lo dicen («N reseñas sin texto»), no les inventan un tono
-- a partir de las estrellas.
--
-- Borrado: la fila cuelga de google_reviews (on delete cascade), así que se va
-- sola cuando se desvincula la ficha (0025) o se desconecta Google (0024).
--
-- Al modelo se le manda el texto y las estrellas. Nunca el nombre de quien
-- escribió la reseña.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. TABLA
-- ---------------------------------------------------------------------------
create table if not exists public.google_review_analysis (
  review_id           uuid primary key references public.google_reviews(id) on delete cascade,
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  google_location_id  uuid not null references public.google_locations(id) on delete cascade,
  sentiment           text not null check (sentiment in ('positive', 'neutral', 'negative')),
  topics              jsonb not null default '[]'::jsonb check (jsonb_typeof(topics) = 'array'),
  keywords            jsonb not null default '[]'::jsonb check (jsonb_typeof(keywords) = 'array'),
  model               text not null,
  review_updated_time timestamptz not null,
  analyzed_at         timestamptz not null default now()
);

create index if not exists google_review_analysis_org_idx
  on public.google_review_analysis (organization_id);


-- ---------------------------------------------------------------------------
-- 2. RLS — mismo alcance que google_reviews_select (0024), más Business
-- ---------------------------------------------------------------------------
alter table public.google_review_analysis enable row level security;
alter table public.google_review_analysis force row level security;

revoke all on public.google_review_analysis from anon;
revoke insert, update, delete, truncate on public.google_review_analysis from authenticated;
grant select on public.google_review_analysis to authenticated;

drop policy if exists google_review_analysis_select on public.google_review_analysis;
create policy google_review_analysis_select on public.google_review_analysis
  for select to authenticated
  using (
    private.org_has_business(organization_id)
    and (
      organization_id = any ((select unnest(
        private.orgs_with_access(array['owner','admin','viewer']::public.org_role[])
      )))
      or google_location_id in (
        select gl.id from public.google_locations gl
        where gl.location_id = any ((select unnest(private.visible_location_ids())))
      )
    )
  );


-- ---------------------------------------------------------------------------
-- 3. LO QUE LEEN LAS PANTALLAS
-- ---------------------------------------------------------------------------
-- Cada análisis con la fecha y las estrellas de su reseña y la sucursal de su
-- ficha. security_invoker (invariante 5): el RLS de las dos tablas de abajo es
-- el que decide, así que una cuenta gratis recibe cero filas. Una reseña a la
-- que le borraron el texto después del análisis no aparece.
create or replace view public.v_review_analysis
with (security_invoker = on) as
select
  a.review_id,
  a.organization_id,
  a.google_location_id,
  gl.location_id,
  r.created_time,
  r.star_rating,
  a.sentiment,
  a.topics,
  a.keywords
from public.google_review_analysis a
join public.google_reviews   r  on r.id  = a.review_id
join public.google_locations gl on gl.id = a.google_location_id
where nullif(btrim(r.comment), '') is not null;

revoke all on public.v_review_analysis from anon;
grant select on public.v_review_analysis to authenticated;


-- ---------------------------------------------------------------------------
-- 4. LO QUE USA EL JOB (service_role)
-- ---------------------------------------------------------------------------
-- Reseñas para mandar al modelo: con texto, de una ficha vinculada, de una
-- organización Business, y sin análisis o con uno de una versión vieja de la
-- reseña. Las más nuevas primero, así una ficha con miles de reseñas muestra
-- lo reciente desde el primer día y el resto se completa en las corridas
-- siguientes.
create or replace function public.google_reviews_pending_analysis(p_org uuid, p_limit integer default 200)
returns table (
  review_id    uuid,
  star_rating  smallint,
  comment      text,
  updated_time timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.star_rating, r.comment, r.updated_time
  from public.google_reviews r
  join public.google_locations gl
    on gl.id = r.google_location_id and gl.location_id is not null
  left join public.google_review_analysis a on a.review_id = r.id
  where r.organization_id = p_org
    and private.org_has_business(p_org)
    and nullif(btrim(r.comment), '') is not null
    and (a.review_id is null or a.review_updated_time < r.updated_time)
  order by r.created_time desc, r.id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

revoke all on function public.google_reviews_pending_analysis(uuid, integer) from public, anon, authenticated;
grant execute on function public.google_reviews_pending_analysis(uuid, integer) to service_role;

-- Guarda (o reemplaza) el análisis de una reseña. La organización y la ficha se
-- toman de la reseña, nunca del que llama. Valida la lista cerrada de temas y
-- normaliza las palabras clave, así lo que guarda la base no depende de que el
-- modelo haya respetado el formato.
create or replace function public.google_record_review_analysis(
  p_review_id           uuid,
  p_sentiment           text,
  p_topics              jsonb,
  p_keywords            jsonb,
  p_model               text,
  p_review_updated_time timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review public.google_reviews%rowtype;
  v_topics jsonb;
  v_keywords jsonb;
begin
  select * into v_review from public.google_reviews where id = p_review_id;
  if not found then
    return false;  -- se borró entre la lectura y la escritura (ficha desvinculada)
  end if;

  if p_sentiment not in ('positive', 'neutral', 'negative') then
    raise exception 'Sentimiento inválido: %', p_sentiment using hint = 'invalid_sentiment';
  end if;

  -- Un tema por nombre (el primero que vino), sólo de la lista cerrada.
  select coalesce(jsonb_agg(jsonb_build_object('topic', t.topic, 'sentiment', t.sentiment) order by t.ord), '[]'::jsonb)
    into v_topics
  from (
    select distinct on (e.value->>'topic')
      e.value->>'topic'     as topic,
      e.value->>'sentiment' as sentiment,
      e.ord
    from jsonb_array_elements(coalesce(p_topics, '[]'::jsonb)) with ordinality as e(value, ord)
    where e.value->>'topic' in ('atencion', 'calidad', 'precio', 'espera', 'ambiente', 'limpieza')
      and e.value->>'sentiment' in ('positive', 'neutral', 'negative')
    order by e.value->>'topic', e.ord
  ) t;

  -- Palabras: en minúscula, sin repetir (gana la primera), con tono válido,
  -- hasta 8. El número de fila sale después del distinct, así el tope cuenta
  -- palabras distintas y no las que vinieron repetidas.
  select coalesce(jsonb_agg(jsonb_build_object('term', k.term, 'sentiment', k.sentiment) order by k.ord), '[]'::jsonb)
    into v_keywords
  from (
    select d.term, d.sentiment, d.ord, row_number() over (order by d.ord) as n
    from (
      select distinct on (lower(btrim(e.value->>'term')))
        lower(btrim(e.value->>'term')) as term,
        e.value->>'sentiment'          as sentiment,
        e.ord
      from jsonb_array_elements(coalesce(p_keywords, '[]'::jsonb)) with ordinality as e(value, ord)
      where jsonb_typeof(e.value) = 'object'
        and btrim(coalesce(e.value->>'term', '')) <> ''
        and length(btrim(e.value->>'term')) <= 40
        and e.value->>'sentiment' in ('positive', 'neutral', 'negative')
      order by lower(btrim(e.value->>'term')), e.ord
    ) d
  ) k
  where k.n <= 8;

  insert into public.google_review_analysis
    (review_id, organization_id, google_location_id, sentiment, topics, keywords, model,
     review_updated_time, analyzed_at)
  values
    (v_review.id, v_review.organization_id, v_review.google_location_id, p_sentiment, v_topics,
     v_keywords, p_model, coalesce(p_review_updated_time, v_review.updated_time), now())
  on conflict (review_id) do update set
    sentiment           = excluded.sentiment,
    topics              = excluded.topics,
    keywords            = excluded.keywords,
    model               = excluded.model,
    review_updated_time = excluded.review_updated_time,
    analyzed_at         = excluded.analyzed_at;

  return true;
end;
$$;

revoke all on function public.google_record_review_analysis(uuid, text, jsonb, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.google_record_review_analysis(uuid, text, jsonb, jsonb, text, timestamptz)
  to service_role;
