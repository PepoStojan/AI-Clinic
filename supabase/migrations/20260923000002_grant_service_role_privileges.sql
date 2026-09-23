-- Grants-only fix: tables created via a direct migration connection are
-- owned by `postgres`, and Supabase's auto-grant-on-create hooks did not
-- extend DML privileges to `service_role` (the role our secret key maps
-- to). No schema/columns/constraints change here -- this only lets the
-- server-side secret key read/write the tables it already owns via RLS
-- bypass. anon/authenticated intentionally receive nothing, matching the
-- "no unintentional Data API exposure" requirement.

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.audits,
  public.audit_targets,
  public.component_results,
  public.checklist_items,
  public.grouped_gaps,
  public.reports
to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
