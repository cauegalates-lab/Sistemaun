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
  audit_status text not null default 'pending',
  audited_by text not null default '',
  audited_at timestamptz,
  receipt_path text not null default '',
  receipt_name text not null default '',
  receipt_type text not null default '',
  receipt_size bigint not null default 0,
  receipt_uploaded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Migração segura para quem já criou a tabela em versões anteriores.
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

create index if not exists sales_date_idx on public.sales (sale_date desc);
create index if not exists sales_seller_date_idx on public.sales (seller_name, sale_date desc);
create index if not exists sales_audit_status_idx on public.sales (audit_status, sale_date desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sales-receipts',
  'sales-receipts',
  false,
  3145728,
  array[
    'application/pdf','image/jpeg','image/png','image/webp','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text','application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.sales enable row level security;
-- O navegador não acessa a service role. Banco e Storage privado passam pelas APIs da Vercel.
