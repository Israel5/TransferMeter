update public.quotes q
set customer_view = jsonb_set(
      q.customer_view, '{t}',
      (select jsonb_agg(
          case
            when (q.data->'trips'->(ord-1)::int->>'paxKm') is null then leg
            else leg || jsonb_build_object(
              'pkm', to_jsonb(round((q.data->'trips'->(ord-1)::int->>'paxKm')::numeric, 1)::float8),
              'pmn', to_jsonb(round((q.data->'trips'->(ord-1)::int->>'paxMins')::numeric)::int))
          end order by ord)
       from jsonb_array_elements(q.customer_view->'t') with ordinality as e(leg, ord))
    )
where q.customer_view ? 't'
  and jsonb_typeof(q.customer_view->'t') = 'array'
  and jsonb_array_length(q.customer_view->'t') > 0
  and q.data ? 'trips'
  and q.status in ('sent','approved','declined');
