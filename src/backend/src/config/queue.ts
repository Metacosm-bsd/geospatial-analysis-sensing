import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { config } from './index.js';
import { logger } from './logger.js';

// Queue names
export const QUEUE_NAMES = {
  LIDAR_PROCESSING: 'lidar-processing',
  ANALYSIS: 'analysis',
  FILE_UPLOAD: 'file-upload',
  EXPORT: 'export',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Connection options for BullMQ
const connectionOptions: ConnectionOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

// Queue factory
export const createQueue = (name: QueueName): Queue => {
  const queue = new Queue(name, {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        count: 100,
        age: 24 * 60 * 60, // 24 hours
      },
      removeOnFail: {
        count: 500,
        age: 7 * 24 * 60 * 60, // 7 days
      },
    },
  });

  queue.on('error', (error) => {
    logger.error(`Queue ${name} error:`, error);
  });

  return queue;
};

// Worker factory
export const createWorker = <T, R>(
  name: QueueName,
  processor: (job: Job<T>) => Promise<R>,
  concurrency = 5
): Worker<T, R> => {
  const worker = new Worker<T, R>(name, processor, {
    connection: connectionOptions,
    concurrency,
  });

  worker.on('completed', (job) => {
    logger.info(`Job ${job.id} in queue ${name} completed`);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Job ${job?.id} in queue ${name} failed:`, error);
  });

  worker.on('error', (error) => {
    logger.error(`Worker ${name} error:`, error);
  });

  return worker;
};

// Queue instances (lazy initialization)
const queues: Map<QueueName, Queue> = new Map();

export const getQueue = (name: QueueName): Queue => {
  let queue = queues.get(name);
  if (!queue) {
    queue = createQueue(name);
    queues.set(name, queue);
  }
  return queue;
};

// Cleanup function
export const closeAllQueues = async (): Promise<void> => {
  const closePromises = Array.from(queues.values()).map((queue) => queue.close());
  await Promise.all(closePromises);
  queues.clear();
  logger.info('All queues closed');
};

export default { createQueue, createWorker, getQueue, closeAllQueues, QUEUE_NAMES };
