-- AUDIT-DELETE-001B: soft delete for audits.
-- Nullable, no default -- every existing row stays active (deleted_at IS
-- NULL) automatically. Metadata-only change, no table rewrite.

alter table public.audits
  add column deleted_at timestamptz null;

-- Matches the real query shape: the audits list always filters
-- deleted_at IS NULL and orders by created_at DESC. A partial index scoped
-- to active rows only (rather than indexing deleted_at itself) keeps the
-- index small and serves exactly that query.
create index audits_active_created_at_idx
  on public.audits (created_at desc)
  where deleted_at is null;

-- audits_audit_code_key (unique on audit_code) is intentionally left
-- untouched and NOT made conditional on deleted_at -- a soft-deleted
-- audit's code must never be reusable by a later audit.
