export type ConfidenceTier = 'strong' | 'worth_testing' | 'experimental';

export type BundleArchetype =
  | 'complementary'
  | 'volume_pack'
  | 'tier_up'
  | 'discovery'
  | 'clearance_recovery';

export interface ProductRow {
  id: string;
  shop_id: string;
  sku: string;
  title: string;
  category: string;
  unit_price: number;
  unit_cost: number;
  stock_qty: number;
  days_in_stock: number;
  trend_score: number;
}

export interface SuggestionRow {
  id: string;
  shop_id: string;
  archetype: BundleArchetype;
  confidence_tier: ConfidenceTier;
  score: number;
  affinity_lift: number;
  margin_uplift: number;
  inventory_pressure: number;
  trend_alignment: number;
  cannibalization_risk: number;
  support: number;
  co_occurrences: number;
  why_json: string;
  generated_at: number;
  is_headline: number;
}

export interface WhyThis {
  rationale: string;
  metrics: { label: string; value: string }[];
  similar_shops?: string;
}

export interface AlertRow {
  id: string;
  shop_id: string;
  kind: 'stockout_risk' | 'price_war' | 'trend_window' | 'bundle_decay';
  severity: 'info' | 'warn' | 'critical';
  title: string;
  body: string;
  product_id: string | null;
  generated_at: number;
  dismissed_at: number | null;
}
