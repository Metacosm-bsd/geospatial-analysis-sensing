import Redis from 'ioredis';
import { config } from './index.js';
import { logger } from './logger.js';

export const createRedisConnection = (): Redis => {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    ...(config.redis.password && { password: config.redis.password }),
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      if (times > 3) {
        logger.error(`Redis connection failed after ${times} attempts`);
        return null; // Stop retrying
      }
      const delay = Math.min(times * 200, 2000);
      logger.warn(`Redis connection attempt ${times}, retrying in ${delay}ms`);
      return delay;
    },
  });

  redis.on('connect', () => {
    logger.info('Redis connected');
  });

  redis.on('error', (error) => {
    logger.error('Redis error:', error);
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return redis;
};

// Singleton Redis connection
let redisInstance: Redis | null = null;

export const getRedisConnection = (): Redis => {
  if (!redisInstance) {
    redisInstance = createRedisConnection();
  }
  return redisInstance;
};

export const closeRedisConnection = async (): Promise<void> => {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    logger.info('Redis connection closed');
  }
};

export default getRedisConnection;
