create extension if not exists pgcrypto;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null,
  seller_name text not null,
  student_name text not null,
  payment_type text not null check (payment_type in ('cartao','boleto','sem_taxa_migracao')),
  fee_value numeric(12,2) not null default 0,
  installments integer not null default 0,
  total_value numeric(12,2) not null default 0,
  modality text not null,
  pending text not null default '',
  course text not null,
  state text not null,
  origin text not null,
  course_quantity integer not null default 1 check (course_quantity > 0),
  sheet_sync_status text not null default 'pending',
  sheet_synced_at timestamptz,
  sheet_sync_error text not null default '',
  audit_status text not null default 'pending',
  audited_by text not null default '',
  audited_at timestamptz,
  -- Campos legados mantidos somente para migrar comprovantes da V7.
  receipt_path text not null default '',
  receipt_name text not null default '',
  receipt_type text not null default '',
  receipt_size bigint not null default 0,
  receipt_uploaded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sales add column if not exists sheet_sync_status text not null default 'pending';
alter table public.sales add column if not exists sheet_synced_at timestamptz;
alter table public.sales add column if not exists sheet_sync_error text not null default '';
alter table public.sales add column if not exists audit_status text not null default 'pending';
alter table public.sales add column if not exists audited_by text not null default '';
alter table public.sales add column if not exists audited_at timestamptz;
alter table public.sales add column if not exists receipt_path text not null default '';
alter table public.sales add column if not exists receipt_name text not null default '';
alter table public.sales add column if not exists receipt_type text not null default '';
alter table public.sales add column if not exists receipt_size bigint not null default 0;
alter table public.sales add column if not exists receipt_uploaded_at timestamptz;

alter table public.sales drop constraint if exists sales_audit_status_check;
alter table public.sales add constraint sales_audit_status_check check (audit_status in ('pending','ok','not_ok'));

create table if not exists public.sales_receipts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Converte automaticamente o comprovante único das versões anteriores para a nova estrutura de até 3 arquivos.
insert into public.sales_receipts (sale_id,file_path,file_name,file_type,file_size,created_at)
select s.id,s.receipt_path,coalesce(nullif(s.receipt_name,''),'Comprovante'),coalesce(nullif(s.receipt_type,''),'application/octet-stream'),s.receipt_size,coalesce(s.receipt_uploaded_at,s.created_at)
from public.sales s
where s.receipt_path <> ''
  and not exists (select 1 from public.sales_receipts r where r.sale_id=s.id and r.file_path=s.receipt_path);

create or replace function public.enforce_sales_receipt_limit()
returns trigger language plpgsql as $$
begin
  perform 1 from public.sales where id = new.sale_id for update;
  if (select count(*) from public.sales_receipts where sale_id = new.sale_id) >= 3 then
    raise exception 'Cada venda pode ter no máximo 3 comprovantes.';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_receipts_limit_trigger on public.sales_receipts;
create trigger sales_receipts_limit_trigger
before insert on public.sales_receipts
for each row execute function public.enforce_sales_receipt_limit();

create index if not exists sales_date_idx on public.sales (sale_date desc);
create index if not exists sales_seller_date_idx on public.sales (seller_name, sale_date desc);
create index if not exists sales_audit_status_idx on public.sales (audit_status, sale_date desc);
create index if not exists sales_receipts_sale_idx on public.sales_receipts (sale_id, created_at asc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sales-receipts','sales-receipts',false,3145728,
  array['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text','application/octet-stream']
)
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.sales enable row level security;
alter table public.sales_receipts enable row level security;
-- O navegador não acessa a service role. Banco e Storage privado passam pelas APIs da Vercel.

-- FCA: relatórios enviados pelos vendedores e ações criadas pelo gestor.
create table if not exists public.fca_reports (
  id uuid primary key default gen_random_uuid(),
  seller_name text not null,
  period_type text not null default 'weekly' check (period_type in ('weekly','monthly')),
  period_start date not null,
  period_end date not null,
  indicator text not null default 'Faturamento',
  situation text not null default 'Ponto de atenção',
  reason text not null default '',
  positives text not null default '',
  obstacles text not null default '',
  self_action text not null default '',
  support_needed text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'submitted' check (status in ('submitted','feedback_requested','feedback_answered','action_created','closed')),
  feedback_request text not null default '',
  feedback_requested_by text not null default '',
  feedback_requested_at timestamptz,
  feedback_response text not null default '',
  feedback_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fca_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.fca_reports(id) on delete set null,
  seller_name text not null,
  manager_name text not null default '',
  title text not null,
  description text not null,
  due_date date,
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists fca_reports_seller_idx on public.fca_reports (seller_name, created_at desc);
create index if not exists fca_reports_status_idx on public.fca_reports (status, created_at desc);
create index if not exists fca_actions_seller_idx on public.fca_actions (seller_name, status, created_at desc);
alter table public.fca_reports enable row level security;
alter table public.fca_actions enable row level security;
