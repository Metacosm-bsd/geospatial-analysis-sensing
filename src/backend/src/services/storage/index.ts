/**
 * Storage Adapter Factory
 * Creates and exports the appropriate storage adapter based on configuration
 */

import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { LocalStorageAdapter } from './local.adapter.js';
import { S3StorageAdapter } from './s3.adapter.js';
import type { IStorageAdapter, StorageType } from './storage.interface.js';

// Re-export types and interfaces
export * from './storage.interface.js';
export { LocalStorageAdapter } from './local.adapter.js';
export { S3StorageAdapter } from './s3.adapter.js';

/**
 * Singleton storage adapter instance
 */
let storageInstance: IStorageAdapter | null = null;

/**
 * Create a storage adapter based on configuration
 */
export function createStorageAdapter(type?: StorageType): IStorageAdapter {
  const storageType = type ?? config.storage.type;

  switch (storageType) {
    case 's3':
      if (!config.s3.bucket) {
        throw new Error('S3 bucket is required for S3 storage');
      }
      if (!config.s3.region) {
        throw new Error('S3 region is required for S3 storage');
      }

      const s3Config: {
        bucket: string;
        region: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        endpoint?: string;
        forcePathStyle?: boolean;
      } = {
        bucket: config.s3.bucket,
        region: config.s3.region,
        forcePathStyle: config.s3.forcePathStyle,
      };
      if (config.s3.accessKeyId !== undefined) s3Config.accessKeyId = config.s3.accessKeyId;
      if (config.s3.secretAccessKey !== undefined) s3Config.secretAccessKey = config.s3.secretAccessKey;
      if (config.s3.endpoint !== undefined) s3Config.endpoint = config.s3.endpoint;
      return new S3StorageAdapter(s3Config);

    case 'local':
    default:
      const baseUrl = config.isDevelopment
        ? `http://localhost:${config.port}`
        : config.storage.baseUrl ?? `http://localhost:${config.port}`;

      return new LocalStorageAdapter(config.storage.localPath, baseUrl);
  }
}

/**
 * Get the singleton storage adapter instance
 * Creates the adapter on first call
 */
export function getStorageAdapter(): IStorageAdapter {
  if (!storageInstance) {
    storageInstance = createStorageAdapter();
    logger.info(`Storage adapter initialized: ${config.storage.type}`);
  }
  return storageInstance;
}

/**
 * Reset the storage adapter instance
 * Useful for testing or configuration changes
 */
export function resetStorageAdapter(): void {
  storageInstance = null;
}

/**
 * Storage service object for convenient access
 */
export const storage = {
  getAdapter: getStorageAdapter,
  createAdapter: createStorageAdapter,
  resetAdapter: resetStorageAdapter,
};

export default storage;
