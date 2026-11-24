-- 0054_day_master.sql  (spec 55; it called this 0053, but spec 53 took that number)
--
-- The on-the-day master mostly reads spec 54's tables. This adds what it
-- keeps of its own: whether a collaborator or planner login wants alerts, and
-- who the day lead is.
--
-- Master actions write `day_activity` rows (help_answered, reassigned,
-- marked_started, alert_dismissed, schedule_shifted, cue_go, announced,
-- question_answered); `kind` is already any `^[a-z_]{1,40}$`, so no change.

alter table public.collaborators
  add column day_alerts boolean not null default true;
alter table public.people
  add column day_alerts boolean not null default true;

-- The day lead: a planner or a person from `people` (day_lead_person_id), or one
-- of the two collaborators (day_lead_user_id). At most one is set.
alter table public.weddings
  add column day_lead_person_id uuid,
  add column day_lead_user_id   uuid,
  add constraint weddings_day_lead_one check (num_nonnulls(day_lead_person_id, day_lead_user_id) <= 1),
  add foreign key (day_lead_person_id, id) references public.people (id, wedding_id) on delete set null (day_lead_person_id),
  add foreign key (id, day_lead_user_id)   references public.collaborators (wedding_id, user_id) on delete set null (day_lead_user_id);

-- The planner reads the wedding through v_wedding_basics (0044, 0045), so the
-- day lead is appended there: a planner has to see who answers on the day.
create or replace view public.v_wedding_basics as
select
  w.id,
  w.name,
  w.slug,
  w.wedding_date,
  w.timezone,
  w.capacity,
  w.rsvp_lock_at,
  w.invite_send_on,
  w.reminder_window_days,
  w.created_at,
  w.updated_at,
  w.currency,
  w.day_lead_person_id,
  w.day_lead_user_id
from public.weddings w
where public.can_plan(w.id);

-- "Alerts on the day: on/off" is each person's own switch. A planner can read
-- `people` but not write it (0044), so the switch goes through this function,
-- which can change only the caller's own row.
create or replace function public.set_my_day_alerts(p_wedding_id uuid, p_on boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  update public.collaborators set day_alerts = p_on
   where wedding_id = p_wedding_id and user_id = auth.uid();
  if not found then
    update public.people set day_alerts = p_on
     where wedding_id = p_wedding_id and user_id = auth.uid() and deleted_at is null;
  end if;
end;
$$;
revoke all on function public.set_my_day_alerts(uuid, boolean) from public, anon;
grant execute on function public.set_my_day_alerts(uuid, boolean) to authenticated;
