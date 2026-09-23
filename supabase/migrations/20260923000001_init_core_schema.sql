-- AI-Clinic v1 core schema (INFRA-001)
-- 6 locked tables: audits, audit_targets, component_results, checklist_items, grouped_gaps, reports
-- Source of truth: AI-Clinic-Master-Planning-Final-QA.md section 26, AI-Clinic-Claude-Code-Build-Spec.md section 10.

-- ============================================================================
-- Shared trigger function for updated_at columns
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. audits
-- ============================================================================

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  audit_code text not null,
  contact_name text not null,
  contact_email text not null,
  company_name text not null,
  website_url text not null,
  registered_domain text not null,
  status text not null default 'CREATED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint audits_audit_code_key unique (audit_code),
  constraint audits_status_check check (
    status in (
      'CREATED', 'QUEUED', 'PROCESSING', 'VALIDATING', 'READY_FOR_PDF',
      'GENERATING_PDF', 'COMPLETED', 'BLOCKED', 'PARTIAL', 'FAILED'
    )
  )
);

create index audits_status_idx on public.audits (status);
create index audits_created_at_idx on public.audits (created_at desc);
create index audits_contact_email_idx on public.audits (contact_email);
create index audits_registered_domain_idx on public.audits (registered_domain);

create trigger audits_set_updated_at
  before update on public.audits
  for each row
  execute function public.set_updated_at();

alter table public.audits enable row level security;

-- ============================================================================
-- 2. audit_targets
-- ============================================================================

create table public.audit_targets (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  target_type text not null,
  url text not null,
  name text null,
  prompts jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint audit_targets_target_type_check check (target_type in ('homepage', 'additional')),
  constraint audit_targets_audit_id_url_key unique (audit_id, url)
);

create index audit_targets_audit_id_idx on public.audit_targets (audit_id);

-- Exactly one homepage target per audit.
create unique index audit_targets_one_homepage_per_audit
  on public.audit_targets (audit_id)
  where target_type = 'homepage';

alter table public.audit_targets enable row level security;

-- ============================================================================
-- 3. component_results
-- ============================================================================

create table public.component_results (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  component_name text not null,
  status text not null default 'PENDING',
  raw_result_json jsonb null,
  normalized_result_json jsonb null,
  error_message text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint component_results_component_name_check check (
    component_name in (
      'brand_recognition', 'prompt_visibility', 'social_profiles',
      'directories', 'technical_accessibility'
    )
  ),
  constraint component_results_status_check check (
    status in ('PENDING', 'RUNNING', 'COMPLETED', 'GAP_FOUND', 'COULD_NOT_VERIFY', 'FAILED')
  ),
  constraint component_results_audit_id_component_name_key unique (audit_id, component_name)
);

create index component_results_audit_id_idx on public.component_results (audit_id);
create index component_results_component_status_idx on public.component_results (component_name, status);

create trigger component_results_set_updated_at
  before update on public.component_results
  for each row
  execute function public.set_updated_at();

alter table public.component_results enable row level security;

-- ============================================================================
-- 4. checklist_items
-- ============================================================================

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  target_id uuid null references public.audit_targets (id) on delete cascade,
  component_name text not null,
  check_key text not null,
  status text not null default 'PENDING',
  result_json jsonb null,
  evidence_json jsonb null,
  retry_count integer not null default 0,
  last_error text null,
  idempotency_key text not null,
  started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint checklist_items_status_check check (
    status in ('PENDING', 'RUNNING', 'COMPLETED', 'GAP_FOUND', 'COULD_NOT_VERIFY', 'FAILED')
  ),
  constraint checklist_items_idempotency_key_key unique (idempotency_key)
);

create index checklist_items_audit_id_status_idx on public.checklist_items (audit_id, status);
create index checklist_items_audit_id_component_name_idx on public.checklist_items (audit_id, component_name);

create trigger checklist_items_set_updated_at
  before update on public.checklist_items
  for each row
  execute function public.set_updated_at();

alter table public.checklist_items enable row level security;

-- ============================================================================
-- 5. grouped_gaps
-- ============================================================================

create table public.grouped_gaps (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  gap_key text not null,
  component_name text not null,
  gap_type text not null,
  title text not null,
  affected_checks_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null,
  deterministic_reason text not null,
  interpretation_json jsonb null,
  validation_status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grouped_gaps_validation_status_check check (
    validation_status in ('PENDING', 'PASSED', 'FALLBACK_FACTS_ONLY', 'FAILED')
  ),
  constraint grouped_gaps_audit_id_gap_key_key unique (audit_id, gap_key)
);

create index grouped_gaps_audit_id_idx on public.grouped_gaps (audit_id);
create index grouped_gaps_audit_id_component_name_idx on public.grouped_gaps (audit_id, component_name);

create trigger grouped_gaps_set_updated_at
  before update on public.grouped_gaps
  for each row
  execute function public.set_updated_at();

alter table public.grouped_gaps enable row level security;

-- ============================================================================
-- 6. reports
-- ============================================================================

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  report_version integer not null default 1,
  canonical_report_json jsonb not null,
  pre_pdf_checklist_json jsonb not null,
  ready_for_pdf boolean not null default false,
  blocking_reasons jsonb not null default '[]'::jsonb,
  pdf_storage_path text null,
  status text not null default 'DRAFT',
  generated_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint reports_status_check check (
    status in ('DRAFT', 'READY', 'GENERATING', 'GENERATED', 'FAILED')
  ),
  constraint reports_audit_id_report_version_key unique (audit_id, report_version)
);

create index reports_audit_id_report_version_idx on public.reports (audit_id, report_version desc);
create index reports_status_idx on public.reports (status);

alter table public.reports enable row level security;

-- ============================================================================
-- Storage: private audit-reports bucket
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('audit-reports', 'audit-reports', false)
on conflict (id) do nothing;

-- No storage.objects policies are created: this MVP has no browser-side
-- Supabase Auth users, so all bucket access happens server-side via the
-- secret key, which bypasses RLS. Leaving RLS enabled with zero policies
-- keeps the bucket unreachable to anon/authenticated Data API roles.
