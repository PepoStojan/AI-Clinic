// Hand-authored to match supabase/migrations/20260923000001_init_core_schema.sql.
// Regenerate with `supabase gen types typescript --linked` once the CLI is
// linked to the AI-Clinic project, and diff against this file before replacing it.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AuditStatus =
  | "CREATED"
  | "QUEUED"
  | "PROCESSING"
  | "VALIDATING"
  | "READY_FOR_PDF"
  | "GENERATING_PDF"
  | "COMPLETED"
  | "BLOCKED"
  | "PARTIAL"
  | "FAILED";

export type CheckStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "GAP_FOUND"
  | "COULD_NOT_VERIFY"
  | "FAILED";

export type TargetType = "homepage" | "additional";

export type ComponentName =
  | "brand_recognition"
  | "prompt_visibility"
  | "social_profiles"
  | "directories"
  | "technical_accessibility";

export type GroupedGapValidationStatus =
  | "PENDING"
  | "PASSED"
  | "FALLBACK_FACTS_ONLY"
  | "FAILED";

export type ReportStatus = "DRAFT" | "READY" | "GENERATING" | "GENERATED" | "FAILED";

export interface Database {
  public: {
    Tables: {
      audits: {
        Row: {
          id: string;
          audit_code: string;
          contact_name: string;
          contact_email: string;
          company_name: string;
          website_url: string;
          registered_domain: string;
          status: AuditStatus;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          audit_code: string;
          contact_name: string;
          contact_email: string;
          company_name: string;
          website_url: string;
          registered_domain: string;
          status?: AuditStatus;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["audits"]["Insert"]>;
        Relationships: [];
      };
      audit_targets: {
        Row: {
          id: string;
          audit_id: string;
          target_type: TargetType;
          url: string;
          name: string | null;
          prompts: Json;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          target_type: TargetType;
          url: string;
          name?: string | null;
          prompts?: Json;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_targets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "audit_targets_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
        ];
      };
      component_results: {
        Row: {
          id: string;
          audit_id: string;
          component_name: ComponentName;
          status: CheckStatus;
          raw_result_json: Json | null;
          normalized_result_json: Json | null;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          component_name: ComponentName;
          status?: CheckStatus;
          raw_result_json?: Json | null;
          normalized_result_json?: Json | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["component_results"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "component_results_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
        ];
      };
      checklist_items: {
        Row: {
          id: string;
          audit_id: string;
          target_id: string | null;
          component_name: ComponentName;
          check_key: string;
          status: CheckStatus;
          result_json: Json | null;
          evidence_json: Json | null;
          retry_count: number;
          last_error: string | null;
          idempotency_key: string;
          started_at: string | null;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          target_id?: string | null;
          component_name: ComponentName;
          check_key: string;
          status?: CheckStatus;
          result_json?: Json | null;
          evidence_json?: Json | null;
          retry_count?: number;
          last_error?: string | null;
          idempotency_key: string;
          started_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["checklist_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "checklist_items_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "checklist_items_target_id_fkey";
            columns: ["target_id"];
            referencedRelation: "audit_targets";
            referencedColumns: ["id"];
          },
        ];
      };
      grouped_gaps: {
        Row: {
          id: string;
          audit_id: string;
          gap_key: string;
          component_name: ComponentName;
          gap_type: string;
          title: string;
          affected_checks_json: Json;
          evidence_json: Json;
          deterministic_reason: string;
          interpretation_json: Json | null;
          validation_status: GroupedGapValidationStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          gap_key: string;
          component_name: ComponentName;
          gap_type: string;
          title: string;
          affected_checks_json?: Json;
          evidence_json: Json;
          deterministic_reason: string;
          interpretation_json?: Json | null;
          validation_status?: GroupedGapValidationStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["grouped_gaps"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "grouped_gaps_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          audit_id: string;
          report_version: number;
          canonical_report_json: Json;
          pre_pdf_checklist_json: Json;
          ready_for_pdf: boolean;
          blocking_reasons: Json;
          pdf_storage_path: string | null;
          status: ReportStatus;
          generated_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          report_version?: number;
          canonical_report_json: Json;
          pre_pdf_checklist_json: Json;
          ready_for_pdf?: boolean;
          blocking_reasons?: Json;
          pdf_storage_path?: string | null;
          status?: ReportStatus;
          generated_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "reports_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
