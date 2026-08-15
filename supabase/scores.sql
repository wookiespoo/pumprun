-- PumpRun leaderboard. Run this in the Supabase SQL editor (once).
-- Uses the ANON key from the browser. Never expose service_role.

create extension if not exists pgcrypto;

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  distance integer not null,
  bags integer not null default 0,
  character text not null default '',
  created_at timestamptz not null default now(),
  constraint scores_username_len check (char_length(username) between 3 and 16),
  constraint scores_distance_ok check (distance >= 10 and distance <= 40000),
  constraint scores_bags_ok check (bags >= 0 and bags <= 99999)
);

create index if not exists scores_distance_idx on public.scores (distance desc, created_at asc);

alter table public.scores enable row level security;

drop policy if exists scores_select on public.scores;
create policy scores_select on public.scores
  for select to anon, authenticated
  using (true);

-- No insert / update / delete policies for the client.
revoke all on public.scores from anon, authenticated, public;
grant select on public.scores to anon, authenticated;

create or replace function public.submit_score(
  p_username text,
  p_distance integer,
  p_bags integer,
  p_character text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
  ch text;
  last_at timestamptz;
  new_id uuid;
begin
  uname := trim(p_username);
  if uname is null or uname !~ '^[A-Za-z0-9_-]{3,16}$' then
    raise exception 'bad username';
  end if;
  if p_distance is null or p_distance < 10 or p_distance > 40000 then
    raise exception 'bad distance';
  end if;
  if p_bags is null or p_bags < 0 or p_bags > 99999 then
    raise exception 'bad bags';
  end if;
  ch := left(coalesce(trim(p_character), ''), 24);

  select max(created_at) into last_at
  from public.scores
  where lower(username) = lower(uname);

  if last_at is not null and last_at > now() - interval '20 seconds' then
    raise exception 'too fast';
  end if;

  insert into public.scores (username, distance, bags, character)
  values (uname, p_distance, p_bags, ch)
  returning id into new_id;

  return json_build_object('ok', true, 'id', new_id);
end;
$$;

create or replace function public.player_standing(p_username text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select
      coalesce(max(distance), 0) as best,
      coalesce((array_agg(bags order by distance desc, created_at desc))[1], 0) as bags
    from public.scores
    where lower(username) = lower(trim(p_username))
  )
  select json_build_object(
    'best', me.best,
    'bags', me.bags,
    'rank', case
      when me.best <= 0 then null
      else 1 + (select count(*) from public.scores s where s.distance > me.best)
    end
  )
  from me;
$$;

revoke all on function public.submit_score(text, integer, integer, text) from public;
revoke all on function public.player_standing(text) from public;
grant execute on function public.submit_score(text, integer, integer, text) to anon, authenticated;
grant execute on function public.player_standing(text) to anon, authenticated;
