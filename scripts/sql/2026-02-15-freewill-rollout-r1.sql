-- Free-Will rollout R1 schema foundation
-- Safe to run multiple times.

create table if not exists public.group_memberships (
  id bigserial primary key,
  agent_id bigint not null references public.agents(id) on delete cascade,
  cult_id bigint not null,
  role text not null default 'member',
  active boolean not null default true,
  joined_at bigint not null,
  left_at bigint null,
  join_reason text null,
  source_bribe_id bigint null
);

create unique index if not exists ux_group_memberships_active_agent
  on public.group_memberships(agent_id)
  where active = true;

create index if not exists ix_group_memberships_cult_id on public.group_memberships(cult_id);
create index if not exists ix_group_memberships_agent_id on public.group_memberships(agent_id);

create table if not exists public.leadership_elections (
  id bigserial primary key,
  cult_id bigint not null,
  round_index integer not null,
  opened_at bigint not null,
  closes_at bigint not null,
  status text not null,
  winner_agent_id bigint null references public.agents(id) on delete set null,
  prize_amount text not null default '0',
  seed text not null
);

create index if not exists ix_leadership_elections_cult_id on public.leadership_elections(cult_id);
create index if not exists ix_leadership_elections_status on public.leadership_elections(status);

create table if not exists public.leadership_votes (
  id bigserial primary key,
  election_id bigint not null references public.leadership_elections(id) on delete cascade,
  voter_agent_id bigint not null references public.agents(id) on delete cascade,
  candidate_agent_id bigint not null references public.agents(id) on delete cascade,
  weight integer not null default 1,
  rationale text null,
  bribe_offer_id bigint null
);

create index if not exists ix_leadership_votes_election_id on public.leadership_votes(election_id);
create index if not exists ix_leadership_votes_voter_agent_id on public.leadership_votes(voter_agent_id);

create table if not exists public.bribe_offers (
  id bigserial primary key,
  from_agent_id bigint not null references public.agents(id) on delete cascade,
  to_agent_id bigint not null references public.agents(id) on delete cascade,
  target_cult_id bigint not null,
  purpose text not null,
  amount text not null,
  status text not null,
  acceptance_probability double precision not null default 0.0,
  accepted_at bigint null,
  expires_at bigint null,
  created_at bigint not null
);

create index if not exists ix_bribe_offers_target_cult_id on public.bribe_offers(target_cult_id);
create index if not exists ix_bribe_offers_status on public.bribe_offers(status);

create table if not exists public.leadership_payouts (
  id bigserial primary key,
  election_id bigint not null references public.leadership_elections(id) on delete cascade,
  cult_id bigint not null,
  winner_agent_id bigint not null references public.agents(id) on delete cascade,
  amount text not null,
  mode text not null,
  tx_hash text null,
  created_at bigint not null
);

create index if not exists ix_leadership_payouts_cult_id on public.leadership_payouts(cult_id);

create table if not exists public.conversation_threads (
  id bigserial primary key,
  kind text not null,
  topic text not null,
  visibility text not null default 'public',
  participant_agent_ids jsonb not null default '[]'::jsonb,
  participant_cult_ids jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null
);

create index if not exists ix_conversation_threads_kind on public.conversation_threads(kind);
create index if not exists ix_conversation_threads_updated_at on public.conversation_threads(updated_at);

create table if not exists public.conversation_messages (
  id bigserial primary key,
  thread_id bigint not null references public.conversation_threads(id) on delete cascade,
  from_agent_id bigint not null references public.agents(id) on delete cascade,
  to_agent_id bigint null references public.agents(id) on delete set null,
  from_cult_id bigint not null,
  to_cult_id bigint null,
  message_type text not null,
  intent text null,
  content text not null,
  visibility text not null default 'public',
  timestamp bigint not null
);

create index if not exists ix_conversation_messages_thread_id on public.conversation_messages(thread_id);
create index if not exists ix_conversation_messages_timestamp on public.conversation_messages(timestamp);

create table if not exists public.planner_runs (
  id bigserial primary key,
  agent_id bigint not null references public.agents(id) on delete cascade,
  cult_id bigint not null,
  cycle_count bigint not null,
  objective text not null,
  horizon integer not null default 1,
  rationale text null,
  step_count integer not null default 1,
  status text not null default 'running',
  started_at bigint not null default 0,
  finished_at bigint null,
  created_at timestamptz not null default now(),
  completed_at bigint null
);

create index if not exists ix_planner_runs_agent_id on public.planner_runs(agent_id);
create index if not exists ix_planner_runs_cycle_count on public.planner_runs(cycle_count);

create table if not exists public.planner_steps (
  id bigserial primary key,
  run_id bigint not null references public.planner_runs(id) on delete cascade,
  step_index integer not null,
  step_type text not null,
  target_cult_id bigint null,
  target_agent_id bigint null references public.agents(id) on delete set null,
  amount text null,
  message text null,
  conditions text null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  result jsonb null,
  started_at bigint null,
  finished_at bigint null,
  created_at timestamptz not null default now()
);

create index if not exists ix_planner_steps_run_id on public.planner_steps(run_id);
create index if not exists ix_planner_steps_status on public.planner_steps(status);

create table if not exists public.planner_step_results (
  id bigserial primary key,
  step_id bigint not null references public.planner_steps(id) on delete cascade,
  run_id bigint not null references public.planner_runs(id) on delete cascade,
  status text not null,
  tx_hash text null,
  error_message text null,
  output jsonb null,
  started_at bigint not null,
  finished_at bigint null,
  created_at timestamptz not null default now()
);

create index if not exists ix_planner_step_results_run_id on public.planner_step_results(run_id);

-- Backward compatibility upgrades (idempotent)
alter table public.planner_runs
  add column if not exists horizon integer not null default 1,
  add column if not exists step_count integer not null default 1,
  add column if not exists started_at bigint not null default 0,
  add column if not exists finished_at bigint null,
  add column if not exists created_at timestamptz not null default now();

alter table public.planner_steps
  add column if not exists amount text null,
  add column if not exists message text null,
  add column if not exists conditions text null,
  add column if not exists target_agent_id bigint null references public.agents(id) on delete set null,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists result jsonb null,
  add column if not exists started_at bigint null,
  add column if not exists finished_at bigint null,
  add column if not exists created_at timestamptz not null default now();

alter table public.planner_step_results
  add column if not exists created_at timestamptz not null default now();

-- anon/authenticated runtime grants for newly introduced tables.
grant select, insert, update, delete on table
  public.group_memberships,
  public.bribe_offers,
  public.leadership_elections,
  public.leadership_votes,
  public.leadership_payouts,
  public.conversation_threads,
  public.conversation_messages,
  public.planner_runs,
  public.planner_steps,
  public.planner_step_results
to anon, authenticated;

grant usage, select on sequence
  public.group_memberships_id_seq,
  public.bribe_offers_id_seq,
  public.leadership_elections_id_seq,
  public.leadership_votes_id_seq,
  public.leadership_payouts_id_seq,
  public.conversation_threads_id_seq,
  public.conversation_messages_id_seq,
  public.planner_runs_id_seq,
  public.planner_steps_id_seq,
  public.planner_step_results_id_seq
to anon, authenticated;
