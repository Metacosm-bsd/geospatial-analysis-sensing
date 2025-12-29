/**
 * Carbon Types
 * Sprint 25-30: Carbon Stock Estimation
 */

export type CarbonProtocol = 'vcs' | 'car' | 'acr' | 'fia';

export type PoolType = 'above_ground_live' | 'below_ground_live' | 'dead_wood' | 'litter' | 'soil';

export interface UncertaintyEstimate {
  value: number;
  uncertainty_pct: number;
  lower_bound: number;
  upper_bound: number;
}

export interface CarbonPool {
  carbon_tonnes: number;
  co2e_tonnes: number;
  uncertainty_pct: number;
  carbon_density_t_ha: number;
}

export interface TreeCarbonEstimate {
  tree_id: string;
  species_code: string | null;
  dbh_cm: number;
  height_m: number;
  protocol: CarbonProtocol;
  equation_source: string;
  aboveground_biomass_kg: UncertaintyEstimate;
  belowground_biomass_kg: UncertaintyEstimate;
  total_biomass_kg: UncertaintyEstimate;
  carbon_kg: UncertaintyEstimate;
  co2e_kg: UncertaintyEstimate;
}

export interface ProjectCarbonStock {
  project_id: string;
  analysis_id: string;
  protocol: CarbonProtocol;
  methodology_version: string;
  audit_id: string;
  total_carbon_tonnes: UncertaintyEstimate;
  total_co2e_tonnes: UncertaintyEstimate;
  pools: Record<PoolType, CarbonPool>;
  area_hectares: number;
  tree_count: number;
  calculation_date: string;
  processing_time_ms: number;
}

export interface CarbonCredits {
  gross_co2e_tonnes: number;
  conservative_deduction_pct: number;
  net_co2e_tonnes: number;
  credits: number;
  registry: string;
  methodology: string;
  estimated_value_usd: {
    low: number;
    mid: number;
    high: number;
  };
  price_per_credit_usd: {
    low: number;
    mid: number;
    high: number;
  };
}

export interface CarbonReportSummary {
  report_id: string;
  project_id: string;
  analysis_id: string;
  protocol: CarbonProtocol;
  methodology_version: string;
  audit_id: string;
  summary: {
    total_carbon_tonnes: number;
    total_co2e_tonnes: number;
    uncertainty_pct: number;
    area_hectares: number;
    tree_count: number;
  };
  pools: Record<string, CarbonPool>;
  credits: CarbonCredits | null;
  files: {
    pdf: string | null;
    excel: string | null;
  };
  generated_at: string;
  processing_time_ms: number;
}

export interface AuditRecord {
  audit_id: string;
  calculation_type: string;
  timestamp: string;
  protocol: CarbonProtocol;
  methodology_version: string;
  uncertainty_method: string;
  uncertainty_pct: number;
  equation_sources: string[];
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  system_version: string;
}

export interface ProtocolInfo {
  name: CarbonProtocol;
  full_name: string;
  description: string;
  carbon_fraction: number;
  conservative_deduction: string;
  methodology: string;
}
