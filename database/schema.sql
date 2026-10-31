-- Ledgerly v1. Run in the Supabase SQL Editor. All app objects use the ap_ prefix.
-- Private data: no anon/authenticated grants or permissive RLS policies.
begin;
create table if not exists public.ap_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tax_id text,
  approved boolean not null default false
);
create table if not exists public.ap_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  vendor_id uuid not null references public.ap_vendors(id),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(16,2) not null check (amount > 0),
  accepted_amount numeric(16,2) not null default 0 check (accepted_amount >= 0 and accepted_amount <= amount),
  status text not null default 'open' check (status in ('open', 'closed'))
);
create table if not exists public.ap_executions (
  id uuid primary key,
  filename text not null,
  file_hash text not null,
  storage_path text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'interrupted')),
  outcome text check (outcome in ('ready', 'needs_review', 'blocked')),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected', 'information_requested')),
  vendor_name text,
  invoice_number text,
  invoice_identity text,
  total numeric(16,2),
  currency text,
  po_id uuid references public.ap_purchase_orders(id),
  extraction jsonb,
  decision jsonb,
  ai_model text,
  policy_version text not null default '1.0',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer
);
create index if not exists ap_executions_created_idx on public.ap_executions(created_at desc);
create index if not exists ap_executions_hash_idx on public.ap_executions(file_hash);
create index if not exists ap_executions_identity_idx on public.ap_executions(invoice_identity);
create unique index if not exists ap_accepted_invoice_unique on public.ap_executions(invoice_identity) where review_status = 'approved';
create table if not exists public.ap_stages (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.ap_executions(id) on delete cascade,
  position integer not null,
  name text not null,
  status text not null check (status in ('running', 'completed', 'failed', 'skipped')),
  detail text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(execution_id, position)
);
create table if not exists public.ap_reviews (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.ap_executions(id),
  action text not null check (action in ('approve', 'reject', 'request_info')),
  reviewer text not null,
  comment text not null,
  created_at timestamptz not null default now()
);

alter table public.ap_vendors enable row level security;
alter table public.ap_purchase_orders enable row level security;
alter table public.ap_executions enable row level security;
alter table public.ap_stages enable row level security;
alter table public.ap_reviews enable row level security;
revoke all on public.ap_vendors, public.ap_purchase_orders, public.ap_executions, public.ap_stages, public.ap_reviews from anon, authenticated;
grant select, insert, update, delete on public.ap_vendors, public.ap_purchase_orders, public.ap_executions, public.ap_stages, public.ap_reviews to service_role;

-- Lock the execution and PO, then recheck eligibility before changing the balance.
create or replace function public.ap_review_invoice(p_execution_id uuid, p_action text, p_reviewer text, p_comment text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare e public.ap_executions%rowtype; p public.ap_purchase_orders%rowtype; result_status text;
begin
  if p_action not in ('approve', 'reject', 'request_info') or length(trim(p_comment)) < 5 or length(trim(p_reviewer)) < 2 then
    raise exception 'Invalid review input';
  end if;
  select * into e from public.ap_executions where id = p_execution_id for update;
  if not found then raise exception 'Execution not found'; end if;
  if e.status <> 'completed' then raise exception 'Only completed executions can be reviewed'; end if;
  if e.review_status in ('approved', 'rejected') then raise exception 'This review is already final'; end if;
  if p_action = 'approve' then
    if e.outcome <> 'ready' or e.po_id is null or e.total is null or e.total <= 0 or e.invoice_identity is null then
      raise exception 'Unresolved checks prevent approval. Submit a corrected invoice';
    end if;
    -- The lock serializes approvals for the same vendor/invoice even on different POs.
    perform pg_advisory_xact_lock(hashtextextended(e.invoice_identity, 0));
    if exists(select 1 from public.ap_executions where invoice_identity = e.invoice_identity and review_status = 'approved' and id <> e.id) then
      raise exception 'This invoice was already approved';
    end if;
    select * into p from public.ap_purchase_orders where id = e.po_id for update;
    if not found or p.status <> 'open' or e.currency <> p.currency then raise exception 'PO is no longer eligible'; end if;
    if not exists(select 1 from public.ap_vendors v where v.id = p.vendor_id and v.approved and regexp_replace(upper(v.name), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(e.vendor_name), '[^A-Z0-9]', '', 'g')) then
      raise exception 'Vendor is no longer eligible';
    end if;
    if p.accepted_amount + e.total > p.amount then raise exception 'PO remaining balance changed; approval would exceed the PO'; end if;
    update public.ap_purchase_orders set accepted_amount = accepted_amount + e.total where id = p.id;
    result_status := 'approved';
  elsif p_action = 'reject' then result_status := 'rejected';
  else result_status := 'information_requested';
  end if;
  update public.ap_executions set review_status = result_status, updated_at = now() where id = e.id;
  insert into public.ap_reviews(execution_id, action, reviewer, comment) values(e.id, p_action, trim(p_reviewer), trim(p_comment));
  return jsonb_build_object('review_status', result_status);
end;
$$;
revoke all on function public.ap_review_invoice(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.ap_review_invoice(uuid,text,text,text) to service_role;

create or replace function public.ap_dashboard()
returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'completed', count(*) filter(where status = 'completed'),
    'failed', count(*) filter(where status in ('failed','interrupted')),
    'running', count(*) filter(where status = 'running'),
    'pending_reviews', count(*) filter(where status = 'completed' and review_status in ('pending','information_requested')),
    'ready', count(*) filter(where outcome = 'ready'),
    'needs_review', count(*) filter(where outcome = 'needs_review'),
    'blocked', count(*) filter(where outcome = 'blocked'),
    'approved', count(*) filter(where review_status = 'approved'),
    'average_duration_ms', coalesce(round(avg(duration_ms) filter(where status = 'completed')), 0)
  ) from public.ap_executions;
$$;
revoke all on function public.ap_dashboard() from public, anon, authenticated;
grant execute on function public.ap_dashboard() to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('ap-invoices', 'ap-invoices', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;
commit;
