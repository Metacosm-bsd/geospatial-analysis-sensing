/**
 * useCarbonEstimation Hook
 * Sprint 25-30: Carbon Stock Estimation
 *
 * React hook for carbon stock estimation API calls.
 */

import { useState, useCallback } from 'react';
import type {
  TreeCarbonEstimate,
  ProjectCarbonStock,
  CarbonCredits,
  CarbonReportSummary,
  CarbonProtocol,
  AuditRecord,
  ProtocolInfo,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

interface CarbonEstimationState {
  loading: boolean;
  error: string | null;
}

interface TreeInput {
  tree_id?: string;
  dbh_cm?: number;
  dbh?: number;
  height_m?: number;
  height?: number;
  species_code?: string;
  biomass_kg?: number;
}

export function useCarbonEstimation() {
  const [state, setState] = useState<CarbonEstimationState>({
    loading: false,
    error: null,
  });

  const setLoading = (loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  };

  const setError = (error: string | null) => {
    setState((prev) => ({ ...prev, error, loading: false }));
  };

  /**
   * Estimate carbon for a single tree
   */
  const estimateTreeCarbon = useCallback(
    async (
      treeId: string,
      dbhCm: number,
      heightM: number,
      speciesCode?: string,
      abovegroundBiomassKg?: number,
      protocol: CarbonProtocol = 'vcs'
    ): Promise<TreeCarbonEstimate> => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          tree_id: treeId,
          dbh_cm: dbhCm.toString(),
          height_m: heightM.toString(),
          protocol,
        });

        if (speciesCode) {
          params.append('species_code', speciesCode);
        }
        if (abovegroundBiomassKg !== undefined) {
          params.append('aboveground_biomass_kg', abovegroundBiomassKg.toString());
        }

        const response = await fetch(
          `${API_BASE_URL}/carbon/estimate-tree?${params.toString()}`,
          { method: 'POST' }
        );

        if (!response.ok) {
          throw new Error(`Failed to estimate tree carbon: ${response.statusText}`);
        }

        const data = await response.json();
        setLoading(false);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      }
    },
    []
  );

  /**
   * Estimate carbon stock for a project
   */
  const estimateProjectCarbon = useCallback(
    async (
      trees: TreeInput[],
      areaHectares: number,
      projectId: string = 'PROJECT001',
      analysisId: string = 'ANALYSIS001',
      protocol: CarbonProtocol = 'vcs'
    ): Promise<ProjectCarbonStock> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/carbon/estimate-project`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trees,
            area_hectares: areaHectares,
            project_id: projectId,
            analysis_id: analysisId,
            protocol,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to estimate project carbon: ${response.statusText}`);
        }

        const data = await response.json();
        setLoading(false);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      }
    },
    []
  );

  /**
   * Calculate carbon credits
   */
  const calculateCredits = useCallback(
    async (co2eTonnes: number, registry: CarbonProtocol = 'vcs'): Promise<CarbonCredits> => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          co2e_tonnes: co2eTonnes.toString(),
          registry,
        });

        const response = await fetch(
          `${API_BASE_URL}/carbon/credits?${params.toString()}`,
          { method: 'POST' }
        );

        if (!response.ok) {
          throw new Error(`Failed to calculate credits: ${response.statusText}`);
        }

        const data = await response.json();
        setLoading(false);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      }
    },
    []
  );

  /**
   * Generate carbon stock report
   */
  const generateReport = useCallback(
    async (
      trees: TreeInput[],
      areaHectares: number,
      projectId: string = 'PROJECT001',
      analysisId: string = 'ANALYSIS001',
      protocol: CarbonProtocol = 'vcs',
      outputFormat: 'pdf' | 'excel' | 'both' = 'both',
      includeCredits: boolean = true
    ): Promise<CarbonReportSummary> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/carbon/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trees,
            area_hectares: areaHectares,
            project_id: projectId,
            analysis_id: analysisId,
            protocol,
            output_format: outputFormat,
            include_credits: includeCredits,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to generate report: ${response.statusText}`);
        }

        const data = await response.json();
        setLoading(false);
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      }
    },
    []
  );

  /**
   * Get supported protocols
   */
  const getProtocols = useCallback(async (): Promise<ProtocolInfo[]> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/carbon/protocols`);

      if (!response.ok) {
        throw new Error(`Failed to get protocols: ${response.statusText}`);
      }

      const data = await response.json();
      setLoading(false);
      return data.protocols;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Get audit trail for a calculation
   */
  const getAuditTrail = useCallback(async (auditId: string): Promise<AuditRecord> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/carbon/audit/${auditId}`);

      if (!response.ok) {
        throw new Error(`Failed to get audit trail: ${response.statusText}`);
      }

      const data = await response.json();
      setLoading(false);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, []);

  return {
    ...state,
    estimateTreeCarbon,
    estimateProjectCarbon,
    calculateCredits,
    generateReport,
    getProtocols,
    getAuditTrail,
  };
}

export default useCarbonEstimation;
