/**
 * useChangeDetection Hook
 * Sprint 31-36: Change Detection & Time Series
 *
 * React hook for interacting with change detection API endpoints.
 */

import { useState, useCallback } from 'react';
import type {
  ChangeDetectionResult,
  TimeSeriesAnalysis,
  ForecastResult,
  ChangeTypeInfo,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface UseChangeDetectionReturn {
  // State
  isLoading: boolean;
  error: string | null;
  changeResult: ChangeDetectionResult | null;
  timeSeriesResult: TimeSeriesAnalysis | null;
  forecastResult: ForecastResult | null;
  changeTypes: ChangeTypeInfo[];

  // Actions
  detectChanges: (params: DetectChangesParams) => Promise<ChangeDetectionResult | null>;
  analyzeTimeSeries: (params: TimeSeriesParams) => Promise<TimeSeriesAnalysis | null>;
  forecastGrowth: (params: ForecastParams) => Promise<ForecastResult | null>;
  exportToGeoJSON: (params: ExportGeoJSONParams) => Promise<object | null>;
  fetchChangeTypes: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

interface DetectChangesParams {
  trees_t1: object[];
  trees_t2: object[];
  date_t1: string;
  date_t2: string;
  area_hectares: number;
  project_id?: string;
  match_distance_m?: number;
  height_tolerance_m?: number;
}

interface TimeSeriesParams {
  epochs: {
    date: string;
    trees: object[];
  }[];
  area_hectares: number;
  project_id?: string;
}

interface ForecastParams {
  epochs: {
    date: string;
    trees: object[];
  }[];
  area_hectares: number;
  forecast_years?: number;
  model_type?: 'linear' | 'exponential' | 'moving_average';
  confidence_level?: number;
  project_id?: string;
}

interface ExportGeoJSONParams {
  trees_t1: object[];
  trees_t2: object[];
  date_t1: string;
  date_t2: string;
  area_hectares: number;
  project_id?: string;
  change_type_filter?: string;
}

export function useChangeDetection(): UseChangeDetectionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeResult, setChangeResult] = useState<ChangeDetectionResult | null>(null);
  const [timeSeriesResult, setTimeSeriesResult] = useState<TimeSeriesAnalysis | null>(null);
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [changeTypes, setChangeTypes] = useState<ChangeTypeInfo[]>([]);

  const clearError = useCallback(() => setError(null), []);

  const reset = useCallback(() => {
    setError(null);
    setChangeResult(null);
    setTimeSeriesResult(null);
    setForecastResult(null);
  }, []);

  const detectChanges = useCallback(async (params: DetectChangesParams): Promise<ChangeDetectionResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        date_t1: params.date_t1,
        date_t2: params.date_t2,
        area_hectares: params.area_hectares.toString(),
        project_id: params.project_id || 'PROJECT001',
        match_distance_m: (params.match_distance_m || 2.0).toString(),
        height_tolerance_m: (params.height_tolerance_m || 1.0).toString(),
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/change/detect?${queryParams}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trees_t1: params.trees_t1,
          trees_t2: params.trees_t2,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Change detection failed');
      }

      const data: ChangeDetectionResult = await response.json();
      setChangeResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const analyzeTimeSeries = useCallback(async (params: TimeSeriesParams): Promise<TimeSeriesAnalysis | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        area_hectares: params.area_hectares.toString(),
        project_id: params.project_id || 'PROJECT001',
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/change/time-series?${queryParams}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epochs: params.epochs }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Time series analysis failed');
      }

      const data: TimeSeriesAnalysis = await response.json();
      setTimeSeriesResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const forecastGrowth = useCallback(async (params: ForecastParams): Promise<ForecastResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        area_hectares: params.area_hectares.toString(),
        forecast_years: (params.forecast_years || 10).toString(),
        model_type: params.model_type || 'linear',
        confidence_level: (params.confidence_level || 0.95).toString(),
        project_id: params.project_id || 'PROJECT001',
      });

      const response = await fetch(`${API_BASE_URL}/api/v1/change/forecast?${queryParams}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epochs: params.epochs }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Forecast failed');
      }

      const data: ForecastResult = await response.json();
      setForecastResult(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const exportToGeoJSON = useCallback(async (params: ExportGeoJSONParams): Promise<object | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        date_t1: params.date_t1,
        date_t2: params.date_t2,
        area_hectares: params.area_hectares.toString(),
        project_id: params.project_id || 'PROJECT001',
      });

      if (params.change_type_filter) {
        queryParams.append('change_type_filter', params.change_type_filter);
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/change/export-geojson?${queryParams}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trees_t1: params.trees_t1,
          trees_t2: params.trees_t2,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'GeoJSON export failed');
      }

      return await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchChangeTypes = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/change/types`);
      if (response.ok) {
        const data = await response.json();
        setChangeTypes(data.change_types || []);
      }
    } catch {
      // Silently fail - use default types
      setChangeTypes([
        { name: 'mortality', description: 'Tree died', color: '#dc2626' },
        { name: 'ingrowth', description: 'New tree', color: '#16a34a' },
        { name: 'growth', description: 'Height increase', color: '#2563eb' },
        { name: 'decline', description: 'Height decrease', color: '#d97706' },
        { name: 'stable', description: 'No change', color: '#6b7280' },
      ]);
    }
  }, []);

  return {
    isLoading,
    error,
    changeResult,
    timeSeriesResult,
    forecastResult,
    changeTypes,
    detectChanges,
    analyzeTimeSeries,
    forecastGrowth,
    exportToGeoJSON,
    fetchChangeTypes,
    clearError,
    reset,
  };
}

export default useChangeDetection;
