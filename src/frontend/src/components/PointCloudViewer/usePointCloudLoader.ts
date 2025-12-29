/**
 * usePointCloudLoader Hook
 * React hook for loading point cloud data with progress tracking
 * Sprint 9-10: Core 3D visualization infrastructure
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  PointCloudData,
  LoaderProgress,
  UsePointCloudLoaderResult,
} from './types';
import {
  parseLASBuffer,
  StreamingPointCloudLoader,
  pointCloudCache,
} from './PointCloudLoader';

/**
 * Hook for loading point cloud data from a URL
 */
export function usePointCloudLoader(): UsePointCloudLoaderResult {
  const [data, setData] = useState<PointCloudData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<LoaderProgress | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const loaderRef = useRef<StreamingPointCloudLoader | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  /**
   * Load point cloud from URL
   */
  const load = useCallback(async (url: string): Promise<void> => {
    // Cancel any ongoing load
    if (loaderRef.current) {
      loaderRef.current.cancel();
    }

    // Check cache first
    if (pointCloudCache.has(url)) {
      const cachedData = pointCloudCache.get(url);
      if (cachedData) {
        setData(cachedData);
        setProgress({
          loaded: 1,
          total: 1,
          percentage: 100,
          stage: 'complete',
        });
        setIsLoading(false);
        setError(null);
        return;
      }
    }

    // Start loading
    currentUrlRef.current = url;
    setIsLoading(true);
    setError(null);
    setProgress({
      loaded: 0,
      total: 0,
      percentage: 0,
      stage: 'downloading',
    });

    try {
      // Create loader
      loaderRef.current = new StreamingPointCloudLoader();

      // Load with progress tracking
      const pointCloudData = await loaderRef.current.load(url, (loaded, total) => {
        if (currentUrlRef.current === url) {
          setProgress({
            loaded,
            total,
            percentage: total > 0 ? Math.round((loaded / total) * 100) : 0,
            stage: 'downloading',
          });
        }
      });

      // Check if this load was cancelled
      if (currentUrlRef.current !== url) {
        return;
      }

      // Update progress to parsing
      setProgress({
        loaded: 1,
        total: 1,
        percentage: 100,
        stage: 'processing',
      });

      // Cache the result
      pointCloudCache.set(url, pointCloudData);

      // Set data
      setData(pointCloudData);
      setProgress({
        loaded: 1,
        total: 1,
        percentage: 100,
        stage: 'complete',
      });
    } catch (err) {
      if (currentUrlRef.current === url) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        setProgress(null);
      }
    } finally {
      if (currentUrlRef.current === url) {
        setIsLoading(false);
        loaderRef.current = null;
      }
    }
  }, []);

  /**
   * Cancel ongoing load
   */
  const cancel = useCallback(() => {
    if (loaderRef.current) {
      loaderRef.current.cancel();
      loaderRef.current = null;
    }
    currentUrlRef.current = null;
    setIsLoading(false);
    setProgress(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    data,
    isLoading,
    progress,
    error,
    load,
    cancel,
  };
}

/**
 * Hook for loading point cloud from a File object
 */
export function usePointCloudFileLoader(): {
  data: PointCloudData | null;
  isLoading: boolean;
  progress: LoaderProgress | null;
  error: Error | null;
  loadFile: (file: File) => Promise<void>;
  clear: () => void;
} {
  const [data, setData] = useState<PointCloudData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<LoaderProgress | null>(null);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Load point cloud from File object
   */
  const loadFile = useCallback(async (file: File): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setProgress({
      loaded: 0,
      total: file.size,
      percentage: 0,
      stage: 'downloading',
    });

    try {
      // Read file as ArrayBuffer
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();

        reader.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress({
              loaded: event.loaded,
              total: event.total,
              percentage: Math.round((event.loaded / event.total) * 100),
              stage: 'downloading',
            });
          }
        };

        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to read file as ArrayBuffer'));
          }
        };

        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };

        reader.readAsArrayBuffer(file);
      });

      // Update progress to parsing
      setProgress({
        loaded: file.size,
        total: file.size,
        percentage: 100,
        stage: 'parsing',
      });

      // Parse the buffer
      const pointCloudData = parseLASBuffer(buffer);

      // Update progress to processing
      setProgress({
        loaded: file.size,
        total: file.size,
        percentage: 100,
        stage: 'processing',
      });

      // Set data
      setData(pointCloudData);
      setProgress({
        loaded: file.size,
        total: file.size,
        percentage: 100,
        stage: 'complete',
      });
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj);
      setProgress(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear loaded data
   */
  const clear = useCallback(() => {
    setData(null);
    setProgress(null);
    setError(null);
  }, []);

  return {
    data,
    isLoading,
    progress,
    error,
    loadFile,
    clear,
  };
}

export default usePointCloudLoader;
