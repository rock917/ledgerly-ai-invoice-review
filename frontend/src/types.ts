export type Run = {
  id: string; filename: string; status: 'running' | 'completed' | 'failed' | 'interrupted';
  outcome: 'ready' | 'needs_review' | 'blocked' | null; review_status: string;
  vendor_name: string | null; invoice_number: string | null; total: number | null;
  currency: string | null; created_at: string; duration_ms: number | null;
}
export type Rule = { code: string; status: 'pass' | 'review' | 'block'; title: string; detected: string; rule: string; next_action: string }
export type Detail = Run & {
  error_message: string | null; ai_model: string | null; policy_version: string;
  extraction: { [key: string]: unknown; evidence: { field: string; quote: string; page: number }[]; uncertainties: string[]; line_items: { description: string; quantity: string | null; unit_price: string | null; amount: string | null }[] } | null;
  decision: { summary: string; rules: Rule[] } | null;
  stages: { id: string; name: string; status: string; detail: string; started_at: string; finished_at: string | null; position: number }[];
  reviews: { id: string; action: string; reviewer: string; comment: string; created_at: string }[];
}
export type DashboardData = { metrics: Record<string, number>; recent: Run[] }
export type PO = { erp_snapshot?: Record<string, unknown> | null; id: string; reference: string; currency: string; amount: number; accepted_amount: number; status: string; vendor: { name: string } }
