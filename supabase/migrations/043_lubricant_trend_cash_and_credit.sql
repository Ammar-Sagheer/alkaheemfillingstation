-- ---------------------------------------------------------------------------
-- 043 - the lubricant trend carries its cash/credit split
--
-- The dashboard's Cash and On credit tiles are FUEL plus OIL. The percent
-- badges compare a day against the day before, and the day before could only
-- be reconstructed for fuel: get_sales_trend has cash_amount and
-- credit_amount per day, get_lubricant_trend had only amounts. So those two
-- tiles shipped without a badge, because the alternative was a percentage
-- that quietly dropped the oil half - wrong by an amount the reader could not
-- see, which is worse than absent.
--
-- lubricant_sales has carried cash_amount and credit_amount since 024, with a
-- check constraint that they add up to the amount. Nothing new is being
-- recorded here; two columns that already exist are being summed and returned.
--
-- NO SCHEMA CHANGE, and nothing to back out. As with 042 this is a widened
-- `returns table (...)`, which Postgres will not do in place - hence the drop
-- and rebuild, and hence the grants restated underneath, because dropping a
-- function takes its grants with it.
--
-- The two new columns go LAST. Every caller reads these by name, but appending
-- rather than inserting keeps positional readers working too, and costs
-- nothing.
-- ---------------------------------------------------------------------------

drop function if exists public.get_lubricant_trend(date, date);

create function public.get_lubricant_trend(p_from date, p_to date)
returns table (
  day           date,
  pack_amount   numeric,
  loose_amount  numeric,
  pack_litres   numeric,
  loose_litres  numeric,
  cash_amount   numeric,
  credit_amount numeric
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
         coalesce(sum(ls.litres) filter (where     l.sold_loose), 0)::numeric,
         -- Across BOTH packed and loose: the dashboard's Cash tile is the
         -- whole day's cash, not one shelf's. The pack/loose split above is a
         -- different question and keeps its own columns.
         coalesce(sum(ls.cash_amount), 0)::numeric,
         coalesce(sum(ls.credit_amount), 0)::numeric
    from generate_series(p_from, p_to, interval '1 day') d
    left join public.lubricant_sales ls on ls.sale_date = d::date
    left join public.lubricants      l  on l.id = ls.lubricant_id
   group by d
   order by d;
end;
$$;

revoke execute on function public.get_lubricant_trend(date, date) from public, anon;
grant  execute on function public.get_lubricant_trend(date, date) to authenticated;
