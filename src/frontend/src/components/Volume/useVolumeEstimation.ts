/**
 * useVolumeEstimation Hook
 * Sprint 17-18: DBH & Volume Estimation
 *
 * React hook for fetching volume estimation data from the API.
 */

import { useState, useCallback } from 'react';
import type {
  TreeEstimate,
  StandTotals,
  SpeciesAllometry,
  CarbonCredits,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

interface VolumeEstimationState {
  loading: boolean;
  error: string | null;
}

interface TreeInput {
  tree_id?: string;
  height: number;
  crown_diameter?: number;
  species_code?: string;
  dbh?: number;
}

interface BatchResult {
  trees: TreeEstimate[];
  count: number;
  processing_time_ms: number;
}

export function useVolumeEstimation() {
  const [state, setState] = useState<VolumeEstimationState>({
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
   * Estimate DBH from height and crown diameter
   */
  const estimateDbh = useCallback(
    async (
      heightM: number,
      crownDiameterM?: number,
      speciesCode?: string,
      method: string = 'combined'
    ): Promise<{ dbh_cm: number; confidence: number }> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/volume/estimate-dbh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            height_m: heightM,
            crown_diameter_m: crownDiameterM,
            species_code: speciesCode,
            method,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to estimate DBH: ${response.statusText}`);
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
   * Get complete tree estimates
   */
  const estimateTree = useCallback(
    async (
      treeId: string,
      heightM: number,
      crownDiameterM?: number,
      speciesCode?: string,
      dbhCm?: number
    ): Promise<TreeEstimate> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/volume/estimate-tree`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tree_id: treeId,
            height_m: heightM,
            crown_diameter_m: crownDiameterM,
            species_code: speciesCode,
            dbh_cm: dbhCm,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to estimate tree: ${response.statusText}`);
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
   * Estimate metrics for a batch of trees
   */
  const estimateBatch = useCallback(
    async (trees: TreeInput[]): Promise<BatchResult> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/volume/estimate-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trees }),
        });

        if (!response.ok) {
          throw new Error(`Failed to estimate batch: ${response.statusText}`);
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
   * Calculate stand-level totals
   */
  const estimateStand = useCallback(
    async (trees: TreeInput[], areaHectares: number): Promise<StandTotals> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/volume/estimate-stand`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trees,
            area_hectares: areaHectares,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to estimate stand: ${response.statusText}`);
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
   * Get available species with allometric equations
   */
  const getAvailableSpecies = useCallback(async (): Promise<
    Array<{
      code: string;
      common_name: string;
      scientific_name: string;
      wood_type: string;
    }>
  > => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/volume/allometry/species`);

      if (!response.ok) {
        throw new Error(`Failed to get species: ${response.statusText}`);
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

  /**
   * Get allometric coefficients for a species
   */
  const getSpeciesAllometry = useCallback(
    async (speciesCode: string): Promise<SpeciesAllometry> => {
      setLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/volume/allometry/species/${speciesCode}`
        );

        if (!response.ok) {
          throw new Error(`Failed to get allometry: ${response.statusText}`);
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
   * Calculate carbon credits from CO2 equivalent
   */
  const calculateCarbonCredits = useCallback(
    async (co2EquivalentKg: number): Promise<CarbonCredits> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/volume/carbon-credits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ co2_equivalent_kg: co2EquivalentKg }),
        });

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

  return {
    ...state,
    estimateDbh,
    estimateTree,
    estimateBatch,
    estimateStand,
    getAvailableSpecies,
    getSpeciesAllometry,
    calculateCarbonCredits,
  };
}

export default useVolumeEstimation;
