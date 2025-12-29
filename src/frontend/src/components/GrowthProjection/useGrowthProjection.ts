/**
 * useGrowthProjection Hook
 * Sprint 37-42: Growth Projections & Timber Value
 *
 * React hook for growth projection and timber valuation APIs.
 */

import { useState, useCallback } from 'react';
import type {
  SiteIndexEstimate,
  GrowthProjectionResult,
  TimberAppraisal,
  TimberPrice,
  GrowthRegionInfo,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface UseGrowthProjectionReturn {
  // State
  isLoading: boolean;
  error: string | null;
  siteIndex: SiteIndexEstimate | null;
  growthProjection: GrowthProjectionResult | null;
  timberAppraisal: TimberAppraisal | null;
  timberPrices: TimberPrice[];
  regions: GrowthRegionInfo[];

  // Actions
  estimateSiteIndex: (params: SiteIndexParams) => Promise<SiteIndexEstimate | null>;
  projectGrowth: (params: GrowthParams) => Promise<GrowthProjectionResult | null>;
  appraiseTimber: (params: AppraisalParams) => Promise<TimberAppraisal | null>;
  fetchTimberPrices: (region: string) => Promise<void>;
  fetchRegions: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

interface SiteIndexParams {
  dominant_height_m: number;
  age_years?: number;
  species_code?: string;
  region?: string;
}

interface GrowthParams {
  trees: object[];
  area_hectares: number;
  projection_years?: number[];
  region?: string;
  project_id?: string;
}

interface AppraisalParams {
  trees: object[];
  area_hectares: number;
  region?: string;
  project_id?: string;
}

export function useGrowthProjection(): UseGrowthProjectionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteIndex, setSiteIndex] = useState<SiteIndexEstimate | null>(null);
  const [growthProjection, setGrowthProjection] = useState<GrowthProjectionResult | null>(null);
  const [timberAppraisal, setTimberAppraisal] = useState<TimberAppraisal | null>(null);
  const [timberPrices, setTimberPrices] = useState<TimberPrice[]>([]);
  const [regions, setRegions] = useState<GrowthRegionInfo[]>([]);

  const clearError = useCallback(() => setError(null), []);

  const reset = useCallback(() => {
    setError(null);
    setSiteIndex(null);
    setGrowthProjection(null);
    setTimberAppraisal(null);
  }, []);

  const estimateSiteIndex = useCallback(async (params: SiteIndexParams): Promise<SiteIndexEstimate | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        dominant_height_m: params.dominant_height_m.toString(),
        region: params.region || 'pnw',
      });

      if (params.age_years) {
        queryParams.append('age_years', params.age_years.toString());
      }
      if (params.species_code) {
        queryParams.append('species_code', params.species_code);
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/growth/site-index?${queryParams}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Site index estimation failed');
      }

      const data: SiteIndexEstimate = await response.json();
      setSiteIndex(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const projectGrowth = useCallback(async (params: GrowthParams): Promise<GrowthProjectionResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        area_hectares: params.area_hectares.toString(),
        region: params.region || 'pnw',
        project_id: params.project_id || 'PROJECT001',
      });

      if (params.projection_years) {
        params.projection_years.forEach(y => queryParams.append('projection_years', y.toString()));
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/growth/project?${queryParams}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params.trees),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Growth projection failed');
      }

      const data: GrowthProjectionResult = await response.json();
      setGrowthProjection(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const appraiseTimber = useCallback(async (params: AppraisalParams): Promise<TimberAppraisal | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        area_hectares: params.area_hectares.toString(),
        region: params.region || 'pnw',
        project_id: params.project_id || 'PROJECT001',
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/timber/appraise?${queryParams}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params.trees),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Timber appraisal failed');
      }

      const data: TimberAppraisal = await response.json();
      setTimberAppraisal(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTimberPrices = useCallback(async (region: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/timber/prices?region=${region}`);
      if (response.ok) {
        const data = await response.json();
        setTimberPrices(data.prices || []);
      }
    } catch {
      // Silently fail
    }
  }, []);

  const fetchRegions = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/growth/regions`);
      if (response.ok) {
        const data = await response.json();
        setRegions(data.regions || []);
      }
    } catch {
      // Use defaults
      setRegions([
        { code: 'pnw', name: 'Pacific Northwest', description: 'Oregon, Washington', base_age_years: 50, primary_species: ['PSME'] },
        { code: 'southeast', name: 'Southeastern US', description: 'Georgia, Alabama', base_age_years: 25, primary_species: ['PITA'] },
      ]);
    }
  }, []);

  return {
    isLoading,
    error,
    siteIndex,
    growthProjection,
    timberAppraisal,
    timberPrices,
    regions,
    estimateSiteIndex,
    projectGrowth,
    appraiseTimber,
    fetchTimberPrices,
    fetchRegions,
    clearError,
    reset,
  };
}

export default useGrowthProjection;
