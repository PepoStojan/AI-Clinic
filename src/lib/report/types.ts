// REPORT-001: the canonical report object. The PDF renderer (PDF-001,
// not built yet) must consume ONLY this object -- no analysis, no
// classification, presentation only (Build Spec section 23/24).

export interface ReportTarget {
  id: string;
  type: string;
  url: string;
  name: string | null;
}

export interface AuditInfoBlock {
  audit_id: string;
  audit_code: string;
  company_name: string;
  website_url: string;
  registered_domain: string;
  contact_name: string;
  contact_email: string;
  created_at: string;
  completed_at: string | null;
  audited_targets: ReportTarget[];
}

export interface BrandRecognitionCounts {
  recognized_by: number;
  total_providers: number;
  accuracy_confirmed: number;
  accuracy_unavailable: number;
  provider_could_not_verify: number;
}

export interface PromptVisibilityCounts {
  valid_checks: number;
  positive_checks: number;
  visibility_percentage: number | null;
  unavailable_checks: number;
}

export interface SocialCounts {
  profiles_found: number;
  profiles_connected: number;
  profiles_not_found: number;
  profiles_unverified: number;
  profiles_could_not_verify: number;
  total_platforms: 8;
}

export interface DirectoriesCounts {
  listings_found: number;
  listings_not_found: number;
  listings_unverified: number;
  listings_could_not_verify: number;
  total_directories: 10;
}

export interface TechnicalCounts {
  allowed: number;
  restricted: number;
  blocked: number;
  cannot_verify: number;
  total_crawlers: 6;
}

export interface ExecutiveFactCountsBlock {
  brand_recognition: BrandRecognitionCounts;
  prompt_visibility: PromptVisibilityCounts;
  social_profiles: SocialCounts;
  directories: DirectoriesCounts;
  technical_accessibility: TechnicalCounts;
  confirmed_gaps_count: number;
  checks_unavailable_count: number;
}

export interface ComponentResultBlock {
  status: string | null;
  findings: unknown; // that component's own normalized_result_json, verbatim
}

export interface ComponentResultsBlock {
  brand_recognition: ComponentResultBlock | null;
  prompt_visibility: ComponentResultBlock | null;
  social_profiles: ComponentResultBlock | null;
  directories: ComponentResultBlock | null;
  technical_accessibility: ComponentResultBlock | null;
}

export interface GroupedGapBlock {
  gap_id: string;
  gap_key: string;
  component_name: string;
  gap_type: string;
  title: string;
  affected_checks: unknown[];
  evidence: unknown[];
  affected_count: number;
  deterministic_reason: string;
  status: "confirmed_gap";
}

export interface InterpretationBlock {
  gap_id: string;
  what_we_observed: string | null;
  what_this_suggests: string | null;
  what_to_consider: string | null;
  validation_status: string;
}

export interface ClosingBlock {
  cta_text: string;
}

export interface ReportMetadataBlock {
  report_version: number;
  assembled_at: string;
  audit_status: string | null;
  components_completed: number;
  components_total: 5;
  checks_unavailable: number;
  confirmed_gaps: number;
  pdf_filename: string;
  ready_for_pdf: boolean;
  blocking_reasons: string[];
}

export interface PreFlightCheckResult {
  check: string;
  passed: boolean;
  reason: string | null;
}

export interface CanonicalReport {
  audit_info: AuditInfoBlock;
  executive_fact_counts: ExecutiveFactCountsBlock;
  component_results: ComponentResultsBlock;
  grouped_gaps: GroupedGapBlock[];
  interpretations: InterpretationBlock[];
  closing: ClosingBlock;
  metadata: ReportMetadataBlock;
}

export interface PreFlightResult {
  readyForPdf: boolean;
  blockingReasons: string[];
  checklist: PreFlightCheckResult[];
}
