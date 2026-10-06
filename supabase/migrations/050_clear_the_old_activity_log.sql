-- =============================================================================
-- 050_clear_the_old_activity_log.sql
--
-- Letting the owner throw away the OLD end of the audit trail.
--
-- WHY, WHEN 035 SAID THE LOG IS APPEND-ONLY FOR EVERYBODY.
--
-- The log grows by a line per change, which on a working day is dozens: every
-- nozzle, every slip, every payment, every dip. It is read the week something
-- looks wrong, and a line from four months ago has never once been the answer -
-- it is the last few weeks that get looked at. Left alone the table grows for
-- ever and the page becomes hundreds of pages of scrolling with the useful end
-- buried at the top of it.
--
-- Append-only was never about the log lasting for ever. It is about a line not
-- being EDITABLE: the person being logged must not be able to soften what a
-- line says, or make one entry disappear while the rest stay - that is what
-- makes the trail worth anything. This keeps all of that. What it adds is one
-- coarse, whole-period, owner-only trim: everything before a cutoff goes, or
-- nothing does. Nobody can reach in and remove the one line about the payment
-- they backdated on Tuesday while leaving Monday and Wednesday in place.
--
-- FOUR THINGS THAT MAKE THIS SAFE TO HAVE:
--
--   * The cutoff is computed HERE, from pump_today(), and only four periods
--     are accepted - one, three, six or twelve months kept. A caller cannot
--     name an arbitrary instant, so "clear everything up to five minutes ago"
--     is not a thing this function can be asked to do.
--   * The most recent month can never be cleared, whatever is asked for.
--   * The trim writes its own line into the log it just trimmed, naming who
--     did it and how many lines went. The trail records that it was cut.
--   * The append-only guard is not disabled to do it. It learns one named
--     exception - `app.trimming_activity`, holding the cutoff date, set only
--     by the function below and only for the length of its transaction, and
--     even then it refuses any row that is NOT older than that cutoff. Same
--     approach as `app.purging_customer` in migration 033, and for the same
--     reason: a stray DELETE from the API, from server code or from a later
--     refactor meets the refusal it always did, because none of them set it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The cutoff, in one place.
--
-- Both the count the dialog shows and the delete it performs come through this
-- function, so the number the owner is shown and the number that actually goes
-- cannot drift apart. Dated at the pump, not at the server: "older than three
-- months" has to mean the same thing here as every other date in the app.
-- ---------------------------------------------------------------------------
create or replace function public.activity_log_cutoff(p_keep_months int)
returns date
language sql
stable
set search_path = public
as $$
  select (public.pump_today() - make_interval(months => p_keep_months))::date;
$$;

comment on function public.activity_log_cutoff(int) is
  'The date before which activity_log entries count as old, keeping p_keep_months.';

-- ---------------------------------------------------------------------------
-- What a trim would remove, before one is asked for.
--
-- The dialog cannot honestly offer "clear entries older than six months"
-- without saying how many that is - the difference between 4 lines and 4,000
-- is the difference between a tidy-up and a decision. All four periods come
-- back in one round trip, with the span of the log, so the page can also say
-- what it would be left with.
-- ---------------------------------------------------------------------------
create or replace function public.activity_log_trim_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total   bigint;
  v_oldest  timestamptz;
  v_newest  timestamptz;
  v_options jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may read the activity log' using errcode = '42501';
  end if;

  select count(*), min(occurred_at), max(occurred_at)
    into v_total, v_oldest, v_newest
    from public.activity_log;

  select coalesce(jsonb_agg(o order by o -> 'months'), '[]'::jsonb)
    into v_options
    from (
      select jsonb_build_object(
               'months', m.months,
               'cutoff', public.activity_log_cutoff(m.months),
               'count',  (select count(*)
                            from public.activity_log a
                           where (a.occurred_at at time zone 'Asia/Karachi')::date
                                 < public.activity_log_cutoff(m.months))
             ) as o
        from unnest(array[1, 3, 6, 12]) as m(months)
    ) t;

  return jsonb_build_object(
    'total',   v_total,
    'oldest',  v_oldest,
    'newest',  v_newest,
    'options', v_options
  );
end;
$$;

comment on function public.activity_log_trim_counts() is
  'How many activity_log lines each retention period would remove, plus the span of the log. Owner only.';

-- ---------------------------------------------------------------------------
-- The guard, with the new exception.
--
-- Restated in full rather than diffed against 035: `create or replace` has to
-- carry the whole body, and a reader should not have to hold two migrations in
-- their head to know what the trigger does.
--
-- UPDATE is still refused outright, for everyone, always. That is the half of
-- append-only that matters - a line may leave, but no line may ever change its
-- story.
-- ---------------------------------------------------------------------------
create or replace function public.trg_activity_log_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- The one way a line may be deleted: clear_activity_log() is running and has
  -- named its cutoff in a transaction-local setting, and this row is genuinely
  -- older than that cutoff. Both halves are checked - the setting alone does
  -- not open the table, it only opens the far end of it.
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.trimming_activity', true), '') <> ''
     and (old.occurred_at at time zone 'Asia/Karachi')::date
         < current_setting('app.trimming_activity')::date
  then
    return old;
  end if;

  raise exception 'The activity log is append-only. It records what happened; it is not edited.'
    using errcode = '0A000';
end;
$$;

comment on function public.trg_activity_log_append_only() is
  'Blocks UPDATE on activity_log always, and DELETE except while '
  'app.trimming_activity names a cutoff the row predates - which only '
  'clear_activity_log() ever sets.';

-- ---------------------------------------------------------------------------
-- The trim itself.
--
-- Whole periods only, and the last month is never on offer. The owner is
-- clearing history he has finished with, not editing this week.
-- ---------------------------------------------------------------------------
create or replace function public.clear_activity_log(p_keep_months int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff   date;
  v_deleted  bigint;
  v_actor_id uuid;
  v_actor    text;
  v_summary  text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may clear the activity log' using errcode = '42501';
  end if;

  if p_keep_months is null or p_keep_months not in (1, 3, 6, 12) then
    raise exception
      'Choose how much of the log to keep: the last month, three months, six months or year.'
      using errcode = '23514';
  end if;

  v_cutoff := public.activity_log_cutoff(p_keep_months);

  select count(*) into v_deleted
    from public.activity_log a
   where (a.occurred_at at time zone 'Asia/Karachi')::date < v_cutoff;

  -- Nothing to do. Said rather than pretended: a trim that removed nothing
  -- should not write a line claiming a clear-out happened.
  if v_deleted = 0 then
    return jsonb_build_object('deleted', 0, 'cutoff', v_cutoff, 'kept_months', p_keep_months);
  end if;

  select a.actor_id, a.actor_name into v_actor_id, v_actor from public.activity_actor() a;

  -- Name the cutoff so the append-only guard will let these particular rows
  -- go, and no others. is_local = true scopes it to this transaction, so it is
  -- gone the moment this returns.
  perform set_config('app.trimming_activity', v_cutoff::text, true);

  delete from public.activity_log a
   where (a.occurred_at at time zone 'Asia/Karachi')::date < v_cutoff;

  perform set_config('app.trimming_activity', '', true);

  -- The trail records its own trim. Written directly rather than by trigger -
  -- activity_log has never had the logging trigger on it, and putting one there
  -- would make every line about a line.
  v_summary := 'Cleared ' || v_deleted || ' older ' ||
               case when v_deleted = 1 then 'entry' else 'entries' end ||
               ' — everything before ' || to_char(v_cutoff, 'DD Mon YYYY');

  insert into public.activity_log
    (actor_id, actor_name, action, entity, entity_label, summary, details)
  values
    (v_actor_id, v_actor, 'deleted', 'activity_log', 'Activity log', v_summary,
     jsonb_build_object(
       'deleted', v_deleted,
       'cutoff', v_cutoff,
       'kept_months', p_keep_months
     ));

  return jsonb_build_object(
    'deleted', v_deleted,
    'cutoff', v_cutoff,
    'kept_months', p_keep_months
  );
end;
$$;

comment on function public.clear_activity_log(int) is
  'Deletes activity_log entries older than a whole retention period (1, 3, 6 or '
  '12 months kept), and logs the trim itself. Owner only; the recent end is '
  'never touched.';

revoke execute on function public.activity_log_cutoff(int)      from public, anon;
revoke execute on function public.activity_log_trim_counts()    from public, anon;
revoke execute on function public.clear_activity_log(int)       from public, anon;
grant  execute on function public.activity_log_cutoff(int)      to authenticated;
grant  execute on function public.activity_log_trim_counts()    to authenticated;
grant  execute on function public.clear_activity_log(int)       to authenticated;
