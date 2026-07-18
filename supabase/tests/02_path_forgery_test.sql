-- Confused-deputy / path-forgery tests.
--
-- WHY THIS FILE EXISTS: 01_proximity_gate_test.sql passed 10/10 against a
-- schema that was still fully defeatable. It asserted on the *response body*
-- at various distances, which was true, while the *system* leaked. The attack:
--
--   1. At 200m the `approaching` band publishes stone.id by design, and
--      cairns_nearby publishes cairn.id.
--   2. Storage keys are a documented pure function of those two ids.
--   3. Attacker inserts a decoy cairn at their OWN position, with a stone whose
--      audio_url points at the VICTIM's derived path.
--   4. cairn_detail on the decoy at 0m returns `unlocked`, and the signer mints
--      a signed URL for someone else's audio.
--
-- The fix: cairn_detail rebuilds the storage path from ids it controls and
-- never echoes a client-written column. These tests prove that holds.

\set QUIET on
\pset pager off

create temp table fresults (n int generated always as identity, name text, pass boolean, detail text);
grant all on fresults to authenticated;
grant usage, select on all sequences in schema pg_temp to authenticated;

do $$
declare
  v_victim   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_attacker uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  v_vc       uuid;   -- victim cairn
  v_vs       uuid;   -- victim stone
  v_decoy    uuid;   -- attacker's decoy cairn
  v_ds       uuid;   -- attacker's forged stone
  v_victim_path text;
  v_res      jsonb;
  v_txt      text;
  v_cnt      int;
  v_err      text;
begin
  delete from public.pins; delete from public.stones; delete from public.cairns;
  delete from public.space_members; delete from public.spaces; delete from public.profiles;
  delete from auth.users where id in (v_victim, v_attacker);

  insert into auth.users (id, email, raw_user_meta_data) values
    (v_victim,   'victim@test.dev',   '{"display_name":"Victim"}'::jsonb),
    (v_attacker, 'attacker@test.dev', '{"display_name":"Attacker"}'::jsonb);

  -- Victim's cairn, far from the attacker.
  insert into public.cairns (space_id, lat, lng, title, created_by, radius_m)
  values (null, 46.0500, 14.4700, 'Victim cairn', v_victim, 30) returning id into v_vc;
  insert into public.stones (cairn_id, author_id, kind, audio_url, transcript)
  values (v_vc, v_victim, 'voice', 'ignored-by-server', 'VICTIM-SECRET-TRANSCRIPT')
  returning id into v_vs;

  v_victim_path := v_vc::text || '/' || v_vs::text || '.m4a';

  -- ---- 1. The 200m recon step: does approaching really publish stone ids? --
  perform public.test_login(v_attacker);
  begin
    v_res := public.cairn_detail(v_vc, 46.05108, 14.4700); -- ~120m
    v_txt := coalesce(v_res::text, '');
  exception when others then v_txt := 'EXCEPTION: ' || sqlerrm;
  end;
  insert into fresults(name, pass, detail) values (
    'recon: approaching band does not leak the victim transcript',
    v_txt not like '%VICTIM-SECRET-TRANSCRIPT%', left(v_txt, 120));

  -- Whether stone ids are published in the approaching band is a DESIGN choice;
  -- record it either way so the consequence is visible rather than assumed.
  insert into fresults(name, pass, detail) values (
    'recon: note whether stone ids are derivable at 120m',
    true,
    case when v_txt like '%' || v_vs::text || '%'
         then 'stone id IS published at 120m -> paths derivable -> path binding is load-bearing'
         else 'stone id not published at 120m -> recon is harder, but do not rely on it' end);

  -- ---- 2. THE ATTACK: decoy cairn at attacker's own position ---------------
  insert into public.cairns (space_id, lat, lng, title, created_by, radius_m)
  values (null, 46.1000, 14.5000, 'Decoy', v_attacker, 30) returning id into v_decoy;

  -- Forge: point this stone's audio at the victim's object path.
  insert into public.stones (cairn_id, author_id, kind, audio_url, transcript)
  values (v_decoy, v_attacker, 'voice', v_victim_path, 'attacker note')
  returning id into v_ds;

  -- Stand on the decoy. Fully unlocked, legitimately.
  begin
    v_res := public.cairn_detail(v_decoy, 46.1000, 14.5000);
    v_txt := coalesce(v_res::text, '');
  exception when others then v_txt := 'EXCEPTION: ' || sqlerrm;
  end;

  insert into fresults(name, pass, detail) values (
    'ATTACK: forged audio_url does not reach the response',
    v_txt not like '%' || v_victim_path || '%',
    'victim path = ' || v_victim_path);

  insert into fresults(name, pass, detail) values (
    'ATTACK: decoy returns its OWN derived path, not the forged one',
    v_txt like '%' || v_decoy::text || '/' || v_ds::text || '.m4a%',
    left(v_txt, 200));

  insert into fresults(name, pass, detail) values (
    'ATTACK: victim transcript never appears on the decoy',
    v_txt not like '%VICTIM-SECRET-TRANSCRIPT%', left(v_txt, 160));

  -- ---- 3. Post-hoc variant: UPDATE an existing stone's path ---------------
  begin
    update public.stones set audio_url = v_victim_path where id = v_ds;
    v_err := 'update permitted';
  exception when others then v_err := 'blocked: ' || sqlerrm;
  end;
  begin
    v_res := public.cairn_detail(v_decoy, 46.1000, 14.5000);
    v_txt := coalesce(v_res::text, '');
  exception when others then v_txt := 'EXCEPTION: ' || sqlerrm;
  end;
  insert into fresults(name, pass, detail) values (
    'ATTACK (post-hoc update): still no victim path in response',
    v_txt not like '%' || v_victim_path || '%', v_err);

  -- ---- 4. Write-path proximity: stack onto a cairn from far away ----------
  -- stack_stone checks distance. Prove the RPC refuses from 5km out.
  begin
    perform public.stack_stone(v_vc, 'text', 46.1000, 14.5000, 'remote graffiti',
                               null, null, null, null);
    v_err := 'ACCEPTED';
  exception when others then v_err := 'rejected: ' || sqlerrm;
  end;
  insert into fresults(name, pass, detail) values (
    'write path: stack_stone refuses from ~5km away',
    v_err <> 'ACCEPTED', v_err);

  -- And prove it accepts when actually standing there.
  begin
    perform public.stack_stone(v_vc, 'text', 46.0500, 14.4700, 'legitimate note',
                               null, null, null, null);
    v_err := 'accepted';
  exception when others then v_err := 'REJECTED: ' || sqlerrm;
  end;
  insert into fresults(name, pass, detail) values (
    'write path: stack_stone accepts when standing on the cairn',
    v_err = 'accepted', v_err);
end
$$;

-- ---- 5. Same attack as a plain client, through the RLS surface ------------
set role authenticated;
select public.test_login('bbbbbbbb-0000-0000-0000-000000000002');

do $$
declare v_cnt int; v_err text;
begin
  begin
    insert into public.stones (cairn_id, author_id, kind, audio_url)
    select id, 'bbbbbbbb-0000-0000-0000-000000000002', 'voice', 'forged/path.m4a'
      from public.cairns limit 1;
    v_err := 'ACCEPTED — client can write stones directly';
  exception when others then v_err := 'blocked: ' || sqlerrm;
  end;
  insert into fresults(name, pass, detail) values (
    'RLS: client cannot INSERT stones directly (must go through stack_stone)',
    v_err <> 'ACCEPTED — client can write stones directly', v_err);

  begin
    update public.stones set audio_url = 'forged/path.m4a';
    v_err := 'ACCEPTED — client can rewrite stone paths';
  exception when others then v_err := 'blocked: ' || sqlerrm;
  end;
  insert into fresults(name, pass, detail) values (
    'RLS: client cannot UPDATE stone audio paths directly',
    v_err <> 'ACCEPTED — client can rewrite stone paths', v_err);

  begin
    insert into public.cairns (space_id, lat, lng, title, created_by)
    values (null, 46.1, 14.5, 'client cairn', 'bbbbbbbb-0000-0000-0000-000000000002');
    v_err := 'accepted';
  exception when others then v_err := 'blocked: ' || sqlerrm;
  end;
  insert into fresults(name, pass, detail) values (
    'note: can a client create a cairn directly? (decoy feasibility)',
    true, v_err);
end
$$;
reset role;

\pset format aligned
\echo ''
\echo '============ PATH FORGERY / CONFUSED DEPUTY RESULTS ============'
select n, case when pass then 'PASS' else '** FAIL **' end as result, name, detail
from fresults order by n;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total
from fresults;
