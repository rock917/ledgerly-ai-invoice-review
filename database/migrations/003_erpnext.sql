-- Additive ERPNext pilot. Apply after 002; never resets existing balances/history.
begin;
alter table public.ap_vendors add column if not exists erp_supplier_id text;
alter table public.ap_purchase_orders add column if not exists erp_snapshot jsonb;
create unique index if not exists ap_vendor_erp_unique on public.ap_vendors(owner_id,erp_supplier_id) where erp_supplier_id is not null;
create table if not exists public.ap_erp_exports (
  execution_id uuid primary key references public.ap_executions(id),
  owner_id uuid not null references auth.users(id),
  status text not null check(status in ('pending','synced','failed')),
  erp_document_id text,
  error_message text,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  foreign key(owner_id,execution_id) references public.ap_executions(owner_id,id)
);
alter table public.ap_erp_exports enable row level security;
revoke all on public.ap_erp_exports from public, anon, authenticated;
grant select,insert,update on public.ap_erp_exports to service_role;

create or replace function public.ap_erp_import(p_owner_id uuid,p_snapshot jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v uuid; p public.ap_purchase_orders%rowtype;
begin
  if p_owner_id is null then raise exception 'Private workspace required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('erp-import:'||p_owner_id::text,0));
  select * into p from public.ap_purchase_orders where owner_id=p_owner_id and reference=p_snapshot->>'reference' for update;
  if found then
    if p.erp_snapshot is null or p.erp_snapshot <> p_snapshot then
      raise exception 'PO already exists with different data. Existing balances were preserved';
    end if;
    return to_jsonb(p);
  end if;
  select id into v from public.ap_vendors where owner_id=p_owner_id and erp_supplier_id=p_snapshot->>'supplier';
  if v is null then
    if exists(select 1 from public.ap_vendors where owner_id=p_owner_id and name=p_snapshot->>'supplier_name') then
      raise exception 'Vendor name already exists without this ERP mapping';
    end if;
    insert into public.ap_vendors(owner_id,name,tax_id,approved,erp_supplier_id)
      values(p_owner_id,p_snapshot->>'supplier_name',p_snapshot->>'tax_id',true,p_snapshot->>'supplier') returning id into v;
  elsif not exists(select 1 from public.ap_vendors where id=v and name=p_snapshot->>'supplier_name' and tax_id is not distinct from p_snapshot->>'tax_id' and approved) then
    raise exception 'ERP vendor mapping changed; inspect it before importing';
  end if;
  insert into public.ap_purchase_orders(owner_id,reference,vendor_id,currency,amount,erp_snapshot)
    values(p_owner_id,p_snapshot->>'reference',v,p_snapshot->>'currency',(p_snapshot->>'amount')::numeric,p_snapshot) returning * into p;
  return to_jsonb(p);
end $$;

create or replace function public.ap_erp_claim(p_owner_id uuid,p_execution_id uuid,p_token uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e public.ap_executions%rowtype; x public.ap_erp_exports%rowtype;
begin
  select * into e from public.ap_executions where id=p_execution_id and owner_id=p_owner_id for update;
  if not found or e.review_status <> 'approved' or e.status <> 'completed' or e.outcome <> 'ready' then
    raise exception 'Only an approved invoice in this workspace can be exported';
  end if;
  select * into x from public.ap_erp_exports where execution_id=e.id for update;
  if found and (x.status='synced' or (x.status='pending' and x.lease_until>now())) then return to_jsonb(x); end if;
  insert into public.ap_erp_exports(execution_id,owner_id,status,lease_token,lease_until,attempts)
    values(e.id,p_owner_id,'pending',p_token,now()+interval '3 minutes',1)
    on conflict(execution_id) do update set status='pending',lease_token=p_token,lease_until=now()+interval '3 minutes',
      attempts=ap_erp_exports.attempts+1,error_message=null,updated_at=now() returning * into x;
  return to_jsonb(x);
end $$;

create or replace function public.ap_erp_finish(p_owner_id uuid,p_execution_id uuid,p_token uuid,p_document_id text,p_error text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare x public.ap_erp_exports%rowtype;
begin
  update public.ap_erp_exports set status=case when p_document_id is not null then 'synced' else 'failed' end,
    erp_document_id=p_document_id,error_message=p_error,lease_until=null,updated_at=now()
    where owner_id=p_owner_id and execution_id=p_execution_id and lease_token=p_token and status='pending' returning * into x;
  if not found then raise exception 'Export lease expired; refresh status before retrying'; end if;
  return to_jsonb(x);
end $$;
revoke all on function public.ap_erp_import(uuid,jsonb), public.ap_erp_claim(uuid,uuid,uuid), public.ap_erp_finish(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ap_erp_import(uuid,jsonb), public.ap_erp_claim(uuid,uuid,uuid), public.ap_erp_finish(uuid,uuid,uuid,text,text) to service_role;
commit;
