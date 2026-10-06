-- =============================================================================
-- 029_lubricant_trend.sql
--
-- A day-by-day series for the lubricant half of the business, so the dashboard
-- can chart the shelf and the drum the way it already charts petrol and diesel.
--
-- WHY NOT EXTEND get_sales_trend. That function is the fuel trend and is read
-- by two screens; widening its return type would force both to change for a
-- figure neither of them asks for. This is a second, narrow series joined on
-- the same date spine.
--
-- WHY MONEY AND NOT LITRES. The fuel chart plots rupees, and these have to sit
-- beside it and be comparable. Litres would also make the two series here
-- unreadable together - a day might be 12 litres off the shelf and 0.4 litres
-- out of the drum, which on one axis is a bar and a flat line, while in money
-- the same day might be Rs 7,000 and Rs 900. The money is the point anyway; the
-- drum's litres are derived from a rate, so they are the softer figure of the
-- two.
--
-- The date spine is generate_series, not the sales themselves, so a day with
-- nothing sold is a zero rather than a gap - a chart that silently closes up
-- its quiet days misreads as a busier business than it is.
-- =============================================================================

create or replace function public.get_lubricant_trend(p_from date, p_to date)
returns table (
  day          date,
  pack_amount  numeric,
  loose_amount numeric,
  pack_litres  numeric,
  loose_litres numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin may view sales reports'
      using errcode = '42501';
  end if;

  return query
  select d::date,
         coalesce(sum(ls.amount) filter (where not l.sold_loose), 0)::numeric,
         coalesce(sum(ls.amount) filter (where     l.sold_loose), 0)::numeric,
         coalesce(sum(ls.litres) filter (where not l.sold_loose), 0)::numeric,
         coalesce(sum(ls.litres) filter (where     l.sold_loose), 0)::numeric
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.lubricant_sales ls on ls.sale_date = d::date
    left join public.lubricants      l  on l.id = ls.lubricant_id
   group by d
   order by d;
end;
$$;

revoke execute on function public.get_lubricant_trend(date, date) from public, anon;
grant  execute on function public.get_lubricant_trend(date, date) to authenticated;
