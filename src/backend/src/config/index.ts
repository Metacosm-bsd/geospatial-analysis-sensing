import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),

  // Database
  DATABASE_URL: z.string().url().optional().default('postgresql://localhost:5432/lidar_forest'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32).default('your-super-secret-jwt-key-change-in-production'),
  JWT_EXPIRES_IN: z.string().default('15m'), // Access token expires in 15 minutes
  JWT_REFRESH_SECRET: z.string().min(32).default('your-super-secret-refresh-key-change-in-production'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'), // Refresh token expires in 7 days

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),

  // File Storage
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  STORAGE_BASE_URL: z.string().optional(),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().transform(Number).default('1073741824'), // 1GB default
  CHUNK_SIZE: z.string().transform(Number).default('10485760'), // 10MB default chunk size

  // AWS S3 Configuration
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_ENDPOINT: z.string().optional(), // For S3-compatible services (MinIO, LocalStack)
  AWS_S3_FORCE_PATH_STYLE: z.string().transform((v) => v === 'true').default('false'),

  // Processing Service
  PROCESSING_SERVICE_URL: z.string().default('http://localhost:8000'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parseEnv = (): z.infer<typeof envSchema> => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }

  return parsed.data;
};

const env = parseEnv();

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  corsOrigins: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),

  storage: {
    type: env.STORAGE_TYPE as 'local' | 's3',
    localPath: env.STORAGE_LOCAL_PATH,
    baseUrl: env.STORAGE_BASE_URL,
    uploadDir: env.UPLOAD_DIR,
    maxFileSize: env.MAX_FILE_SIZE,
    chunkSize: env.CHUNK_SIZE,
  },

  s3: {
    bucket: env.AWS_S3_BUCKET,
    region: env.AWS_S3_REGION,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    endpoint: env.AWS_S3_ENDPOINT,
    forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE,
  },

  processing: {
    serviceUrl: env.PROCESSING_SERVICE_URL,
  },

  logging: {
    level: env.LOG_LEVEL,
  },
} as const;

export type Config = typeof config;
