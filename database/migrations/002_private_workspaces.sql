-- Ledgerly private demo workspaces. Apply once after schema.sql and seed.sql.
-- Existing rows keep owner_id NULL and remain in the legacy workspace.
begin;
create table if not exists public.ap_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table public.ap_user_profiles enable row level security;
revoke all on public.ap_user_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.ap_user_profiles to service_role;

do $$
declare t text;
begin
  foreach t in array array['ap_vendors','ap_purchase_orders','ap_executions','ap_stages','ap_reviews'] loop
    execute format('alter table public.%I add column if not exists owner_id uuid references auth.users(id) on delete cascade', t);
    execute format('create index if not exists %I on public.%I(owner_id)', t || '_owner_idx', t);
  end loop;
end $$;
alter table public.ap_reviews add column if not exists reviewer_user_id uuid references auth.users(id) on delete set null;
alter table public.ap_vendors drop constraint if exists ap_vendors_name_key;
alter table public.ap_purchase_orders drop constraint if exists ap_purchase_orders_reference_key;
create unique index if not exists ap_vendors_owner_name_unique on public.ap_vendors(owner_id, name) nulls not distinct;
create unique index if not exists ap_pos_owner_reference_unique on public.ap_purchase_orders(owner_id, reference) nulls not distinct;
drop index if exists public.ap_accepted_invoice_unique;
create unique index if not exists ap_accepted_invoice_owner_unique on public.ap_executions(owner_id, invoice_identity) nulls not distinct where review_status = 'approved';

-- Composite references prevent cross-workspace associations even from a bug in the API.
do $$
declare t text; spec record;
begin
  foreach t in array array['ap_vendors','ap_purchase_orders','ap_executions'] loop
    if not exists(select 1 from pg_constraint where conname = t || '_owner_id_unique' and conrelid = ('public.' || t)::regclass) then
      execute format('alter table public.%I add constraint %I unique(owner_id,id)',t,t || '_owner_id_unique');
    end if;
  end loop;
  for spec in select * from (values
    ('ap_purchase_orders','vendor_id','ap_vendors'),
    ('ap_executions','po_id','ap_purchase_orders'),
    ('ap_stages','execution_id','ap_executions'),
    ('ap_reviews','execution_id','ap_executions')
  ) as x(child,col,parent) loop
    if not exists(select 1 from pg_constraint where conname = spec.child || '_workspace_fk' and conrelid = ('public.' || spec.child)::regclass) then
      execute format('alter table public.%I add constraint %I foreign key(owner_id,%I) references public.%I(owner_id,id)',spec.child,spec.child || '_workspace_fk',spec.col,spec.parent);
    end if;
  end loop;
end $$;

create or replace function public.ap_ensure_workspace(p_user_id uuid, p_display_name text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare u auth.users%rowtype; northstar uuid; harbor uuid; profile public.ap_user_profiles%rowtype;
begin
  select * into u from auth.users where id=p_user_id;
  if not found or u.email_confirmed_at is null or u.is_anonymous then raise exception 'Verified user required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace:' || p_user_id::text,0));
  insert into public.ap_user_profiles(id,email,display_name)
    values(p_user_id,u.email,left(coalesce(nullif(trim(p_display_name),''),'Workspace owner'),100))
    on conflict(id) do update set email=excluded.email, display_name=excluded.display_name
    returning * into profile;
  insert into public.ap_vendors(owner_id,name,tax_id,approved) values(p_user_id,'Northstar Office Supplies','DEMO-TAX-001',true)
    on conflict(owner_id,name) do nothing;
  insert into public.ap_vendors(owner_id,name,tax_id,approved) values(p_user_id,'Harbor Technology Services','DEMO-TAX-002',true)
    on conflict(owner_id,name) do nothing;
  select id into northstar from public.ap_vendors where owner_id=p_user_id and name='Northstar Office Supplies';
  select id into harbor from public.ap_vendors where owner_id=p_user_id and name='Harbor Technology Services';
  insert into public.ap_purchase_orders(owner_id,reference,vendor_id,currency,amount)
    values(p_user_id,'PO-2026-1001',northstar,'INR',100000),(p_user_id,'PO-2026-1002',harbor,'INR',50000)
    on conflict(owner_id,reference) do nothing;
  return jsonb_build_object('id',profile.id,'display_name',profile.display_name,'email',profile.email,'workspace','private_demo');
end $$;
revoke all on function public.ap_ensure_workspace(uuid,text) from public, anon, authenticated;
grant execute on function public.ap_ensure_workspace(uuid,text) to service_role;

create or replace function public.ap_review_invoice_owned(p_execution_id uuid, p_owner_id uuid, p_action text, p_reviewer text, p_comment text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare e public.ap_executions%rowtype; p public.ap_purchase_orders%rowtype; result_status text;
begin
  if p_action not in ('approve', 'reject', 'request_info') or length(trim(p_comment)) < 5 or length(trim(p_reviewer)) < 2 then
    raise exception 'Invalid review input';
  end if;
  select * into e from public.ap_executions where id = p_execution_id and owner_id is not distinct from p_owner_id for update;
  if not found then raise exception 'Execution not found'; end if;
  if e.status <> 'completed' then raise exception 'Only completed executions can be reviewed'; end if;
  if e.review_status in ('approved', 'rejected') then raise exception 'This review is already final'; end if;
  if p_action = 'approve' then
    if e.outcome <> 'ready' or e.po_id is null or e.total is null or e.total <= 0 or e.invoice_identity is null then
      raise exception 'Unresolved checks prevent approval. Submit a corrected invoice';
    end if;
    -- The lock serializes approvals for the same vendor/invoice even on different POs.
    perform pg_advisory_xact_lock(hashtextextended(coalesce(p_owner_id::text,'legacy') || ':' || e.invoice_identity, 0));
    if exists(select 1 from public.ap_executions where owner_id is not distinct from p_owner_id and invoice_identity = e.invoice_identity and review_status = 'approved' and id <> e.id) then
      raise exception 'This invoice was already approved';
    end if;
    select * into p from public.ap_purchase_orders where id = e.po_id and owner_id is not distinct from p_owner_id for update;
    if not found or p.status <> 'open' or e.currency <> p.currency then raise exception 'PO is no longer eligible'; end if;
    if not exists(select 1 from public.ap_vendors v where v.id = p.vendor_id and v.owner_id is not distinct from p_owner_id and v.approved and regexp_replace(upper(v.name), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(e.vendor_name), '[^A-Z0-9]', '', 'g')) then
      raise exception 'Vendor is no longer eligible';
    end if;
    if p.accepted_amount + e.total > p.amount then raise exception 'PO remaining balance changed; approval would exceed the PO'; end if;
    update public.ap_purchase_orders set accepted_amount = accepted_amount + e.total where id = p.id;
    result_status := 'approved';
  elsif p_action = 'reject' then result_status := 'rejected';
  else result_status := 'information_requested';
  end if;
  update public.ap_executions set review_status = result_status, updated_at = now() where id = e.id;
  insert into public.ap_reviews(execution_id, owner_id, reviewer_user_id, action, reviewer, comment) values(e.id, p_owner_id, p_owner_id, p_action, trim(p_reviewer), trim(p_comment));
  return jsonb_build_object('review_status', result_status);
end;
$$;
revoke all on function public.ap_review_invoice_owned(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.ap_review_invoice_owned(uuid,uuid,text,text,text) to service_role;

create or replace function public.ap_dashboard_owned(p_owner_id uuid)
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
  ) from public.ap_executions where owner_id is not distinct from p_owner_id;
$$;
revoke all on function public.ap_dashboard_owned(uuid) from public, anon, authenticated;
grant execute on function public.ap_dashboard_owned(uuid) to service_role;


-- Old service-only RPC names are restricted to the retained legacy data.
create or replace function public.ap_dashboard() returns jsonb language sql security invoker set search_path=public as $$
  select public.ap_dashboard_owned(null::uuid);
$$;
create or replace function public.ap_review_invoice(p_execution_id uuid,p_action text,p_reviewer text,p_comment text)
returns jsonb language sql security invoker set search_path=public as $$
  select public.ap_review_invoice_owned(p_execution_id,null::uuid,p_action,p_reviewer,p_comment);
$$;
commit;
