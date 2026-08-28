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
  state char(2) not null,
  origin text not null,
  course_quantity integer not null default 1 check (course_quantity > 0),
  sheet_sync_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists sales_date_idx on public.sales (sale_date desc);
create index if not exists sales_seller_date_idx on public.sales (seller_name, sale_date desc);

alter table public.sales enable row level security;
-- O front-end não acessa o Supabase diretamente. A service role fica somente na API da Vercel.
