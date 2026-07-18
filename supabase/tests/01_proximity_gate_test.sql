-- Proximity gate verification.
-- Strategy: plant sentinel strings in audio_url and transcript. Any response
-- whose text contains a sentinel has leaked, wherever it appears. Blunt and
-- hard to fool.

\set QUIET on
\pset pager off

create temp table results (n int generated always as identity, name text, pass boolean, detail text);

do $$
declare
  v_a        uuid := '11111111-1111-1111-1111-111111111111';
  v_b        uuid := '22222222-2222-2222-2222-222222222222';
  v_space    uuid;
  v_personal uuid;
  v_spacec   uuid;
  v_stone    uuid;
  v_res      jsonb;
  v_txt      text;
  v_d        double precision;
  v_cnt      int;
  v_ok       boolean;
begin
  -- Clean slate
  delete from public.pins;
  delete from public.stones;
  delete from public.cairns;
  delete from public.space_members;
  delete from public.spaces;
  delete from public.profiles;
  delete from auth.users where id in (v_a, v_b);

  insert into auth.users (id, email, raw_user_meta_data)
  values (v_a, 'a@test.dev', '{"display_name":"Ana"}'::jsonb),
         (v_b, 'b@test.dev', '{"display_name":"Bojan"}'::jsonb);

  -- ---- 1. distance_m accuracy -------------------------------------------
  -- 0.01 degrees of latitude is ~1111.95 m anywhere on the globe.
  select public.distance_m(46.0500, 14.4700, 46.0600, 14.4700) into v_d;
  insert into results(name, pass, detail) values (
    'distance_m: 0.01 deg latitude ~= 1111.95 m',
    abs(v_d - 1111.95) < 5,
    format('got %s m', round(v_d::numeric, 2)));

  -- Same point must be zero.
  select public.distance_m(46.05, 14.47, 46.05, 14.47) into v_d;
  insert into results(name, pass, detail) values (
    'distance_m: identical points = 0',
    v_d < 0.001, format('got %s', v_d));

  -- ---- setup: a personal cairn with a secret-bearing stone ---------------
  insert into public.cairns (space_id, lat, lng, title, created_by, radius_m)
  values (null, 46.0500, 14.4700, 'Entrance', v_a, 30)
  returning id into v_personal;

  insert into public.stones (cairn_id, author_id, kind, audio_url, transcript)
  values (v_personal, v_a, 'voice',
          'SENTINEL-AUDIO-LEAK', 'SENTINEL-TRANSCRIPT-LEAK')
  returning id into v_stone;

  -- a Space cairn that B is NOT a member of
  insert into public.spaces (name, accent_hex, join_code, created_by)
  values ('Acme Facilities', '#D9A441', 'ACME01', v_a) returning id into v_space;
  insert into public.space_members (space_id, user_id, role) values (v_space, v_a, 'owner');
  insert into public.cairns (space_id, lat, lng, title, created_by, radius_m)
  values (v_space, 46.0500, 14.4700, 'Meeting room', v_a, 30)
  returning id into v_spacec;
  insert into public.stones (cairn_id, author_id, kind, audio_url, transcript)
  values (v_spacec, v_a, 'voice', 'SENTINEL-SPACE-AUDIO', 'SENTINEL-SPACE-TRANSCRIPT');

  -- ---- 2. FAR AWAY: owner, 500 m out, must get no content ---------------
  perform public.test_login(v_a);
  begin
    v_res := public.cairn_detail(v_personal, 46.0545, 14.4700); -- ~500 m north
    v_txt := coalesce(v_res::text, '');
  exception when others then
    v_txt := 'EXCEPTION: ' || sqlerrm;
  end;
  insert into results(name, pass, detail) values (
    'cairn_detail @500m: no audio_url leak',
    v_txt not like '%SENTINEL-AUDIO-LEAK%',
    left(v_txt, 160));
  insert into results(name, pass, detail) values (
    'cairn_detail @500m: no transcript leak',
    v_txt not like '%SENTINEL-TRANSCRIPT-LEAK%',
    left(v_txt, 160));

  -- ---- 3. APPROACHING: 120 m, still withheld ----------------------------
  begin
    v_res := public.cairn_detail(v_personal, 46.05108, 14.4700); -- ~120 m
    v_txt := coalesce(v_res::text, '');
  exception when others then
    v_txt := 'EXCEPTION: ' || sqlerrm;
  end;
  insert into results(name, pass, detail) values (
    'cairn_detail @120m (blur band): still no audio/transcript',
    v_txt not like '%SENTINEL-AUDIO-LEAK%' and v_txt not like '%SENTINEL-TRANSCRIPT-LEAK%',
    left(v_txt, 160));

  -- ---- 4. STANDING ON IT: 0 m, content released -------------------------
  begin
    v_res := public.cairn_detail(v_personal, 46.0500, 14.4700);
    v_txt := coalesce(v_res::text, '');
  exception when others then
    v_txt := 'EXCEPTION: ' || sqlerrm;
  end;
  insert into results(name, pass, detail) values (
    'cairn_detail @0m: audio_url IS released',
    v_txt like '%SENTINEL-AUDIO-LEAK%',
    left(v_txt, 200));
  insert into results(name, pass, detail) values (
    'cairn_detail @0m: transcript IS released',
    v_txt like '%SENTINEL-TRANSCRIPT-LEAK%',
    left(v_txt, 200));

  -- ---- 5. SPOOFING: B stands on the Space cairn but is not a member ------
  perform public.test_login(v_b);
  begin
    v_res := public.cairn_detail(v_spacec, 46.0500, 14.4700); -- standing exactly on it
    v_txt := coalesce(v_res::text, '');
  exception when others then
    v_txt := 'EXCEPTION: ' || sqlerrm;
  end;
  insert into results(name, pass, detail) values (
    'Space cairn: non-member standing ON it gets nothing',
    v_txt not like '%SENTINEL-SPACE%',
    left(v_txt, 160));

  -- ---- 6. nearby must not list a Space cairn to a non-member ------------
  select count(*) into v_cnt from public.cairns_nearby(46.0500, 14.4700, 5000)
   where id = v_spacec;
  insert into results(name, pass, detail) values (
    'cairns_nearby: Space cairn invisible to non-member',
    v_cnt = 0, format('rows=%s (expected 0)', v_cnt));

  -- ---- 7. nearby DOES show the personal cairn, with no content ----------
  perform public.test_login(v_a);
  select count(*) into v_cnt from public.cairns_nearby(46.0900, 14.4700, 50000)
   where id = v_personal;
  insert into results(name, pass, detail) values (
    'cairns_nearby @4.4km: cairn still listed (position is public)',
    v_cnt = 1, format('rows=%s (expected 1)', v_cnt));
end
$$;

-- ---- 8. RLS: can a client read the tables directly, bypassing the RPCs? --
set role authenticated;
select public.test_login('11111111-1111-1111-1111-111111111111');

do $$
declare v_cnt int; v_err text;
begin
  begin
    select count(*) into v_cnt from public.stones;
  exception when others then
    v_cnt := -1; v_err := sqlerrm;
  end;
  insert into results(name, pass, detail) values (
    'RLS: direct SELECT on stones returns nothing to a client',
    v_cnt <= 0, format('rows=%s %s', v_cnt, coalesce(v_err, '')));

  begin
    select count(*) into v_cnt from public.pins;
  exception when others then
    v_cnt := -1; v_err := sqlerrm;
  end;
  insert into results(name, pass, detail) values (
    'RLS: direct SELECT on pins returns nothing to a client',
    v_cnt <= 0, format('rows=%s %s', v_cnt, coalesce(v_err, '')));

  begin
    select count(*) into v_cnt from public.briefings;
  exception when others then
    v_cnt := -1; v_err := sqlerrm;
  end;
  insert into results(name, pass, detail) values (
    'RLS: direct SELECT on briefings returns nothing to a client',
    v_cnt <= 0, format('rows=%s %s', v_cnt, coalesce(v_err, '')));
end
$$;
reset role;

\pset format aligned
\echo ''
\echo '================ PROXIMITY GATE TEST RESULTS ================'
select n, case when pass then 'PASS' else '** FAIL **' end as result, name, detail
from results order by n;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total
from results;
