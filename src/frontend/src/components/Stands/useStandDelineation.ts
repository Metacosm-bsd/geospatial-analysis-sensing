/**
 * useStandDelineation Hook
 * Sprint 21-24: FIA Reports & Export
 *
 * React hook for stand delineation and spatial export.
 */

import { useState, useCallback } from 'react';
import type {
  Stand,
  DelineationResult,
  DelineationParams,
  ExportFormat,
  FIAReport,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

interface StandDelineationState {
  loading: boolean;
  error: string | null;
}

interface TreeInput {
  tree_id?: string;
  x: number;
  y: number;
  height?: number;
  height_m?: number;
  dbh_cm?: number;
  crown_diameter_m?: number;
  species_code?: string;
  volume_m3?: number;
  biomass_kg?: number;
  carbon_kg?: number;
}

export function useStandDelineation() {
  const [state, setState] = useState<StandDelineationState>({
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
   * Delineate stands from tree data
   */
  const delineateStands = useCallback(
    async (
      trees: TreeInput[],
      params: Partial<DelineationParams> = {}
    ): Promise<DelineationResult> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/stands/delineate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trees,
            method: params.method || 'dbscan',
            min_trees: params.min_trees || 5,
            eps: params.eps || 20.0,
            n_clusters: params.n_clusters,
            grid_size: params.grid_size || 50.0,
            attribute_weights: params.attribute_weights,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to delineate stands: ${response.statusText}`);
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
   * Calculate stand summary
   */
  const calculateSummary = useCallback(
    async (
      trees: TreeInput[],
      areaHectares: number,
      standId: string = 'stand_1'
    ): Promise<Stand['summary']> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/stands/summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trees,
            area_hectares: areaHectares,
            stand_id: standId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to calculate summary: ${response.statusText}`);
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
   * Export trees to spatial format
   */
  const exportTrees = useCallback(
    async (
      trees: TreeInput[],
      format: ExportFormat = 'geojson',
      crs: string = 'EPSG:4326'
    ): Promise<object | string> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/export/trees`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trees, format, crs }),
        });

        if (!response.ok) {
          throw new Error(`Failed to export trees: ${response.statusText}`);
        }

        setLoading(false);

        if (format === 'geojson') {
          return await response.json();
        } else {
          return await response.text();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      }
    },
    []
  );

  /**
   * Export stands to spatial format
   */
  const exportStands = useCallback(
    async (
      stands: Stand[],
      format: ExportFormat = 'geojson',
      crs: string = 'EPSG:4326'
    ): Promise<object | string> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/export/stands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stands, format, crs }),
        });

        if (!response.ok) {
          throw new Error(`Failed to export stands: ${response.statusText}`);
        }

        setLoading(false);

        if (format === 'geojson') {
          return await response.json();
        } else {
          return await response.text();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        throw err;
      }
    },
    []
  );

  /**
   * Generate FIA report
   */
  const generateFIAReport = useCallback(
    async (
      trees: TreeInput[],
      plotId: string = 'PLOT001',
      stateCode: string = '41',
      countyCode: string = '001',
      plotAreaAcres: number = 0.25
    ): Promise<FIAReport> => {
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/export/fia`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trees,
            plot_id: plotId,
            state_code: stateCode,
            county_code: countyCode,
            plot_area_acres: plotAreaAcres,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to generate FIA report: ${response.statusText}`);
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
   * Get available delineation methods
   */
  const getMethods = useCallback(async (): Promise<object[]> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/stands/methods`);

      if (!response.ok) {
        throw new Error(`Failed to get methods: ${response.statusText}`);
      }

      const data = await response.json();
      setLoading(false);
      return data.methods;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Get available export formats
   */
  const getExportFormats = useCallback(async (): Promise<object[]> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/export/formats`);

      if (!response.ok) {
        throw new Error(`Failed to get formats: ${response.statusText}`);
      }

      const data = await response.json();
      setLoading(false);
      return data.formats;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    }
  }, []);

  return {
    ...state,
    delineateStands,
    calculateSummary,
    exportTrees,
    exportStands,
    generateFIAReport,
    getMethods,
    getExportFormats,
  };
}

export default useStandDelineation;
