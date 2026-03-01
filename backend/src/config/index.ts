import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:8081',

  // Database (Supabase PostgreSQL)
  databaseUrl: process.env.DATABASE_URL || '',
  directUrl: process.env.DIRECT_URL || '',

  // JWT (for our own access tokens after Firebase auth)
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // Firebase Auth
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  },

  // Super Admin (for seeding)
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@internhub.app',
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
  },

  // Default Program
  defaultProgram: {
    name: process.env.DEFAULT_PROGRAM_NAME || 'Educational Research Group',
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
  },

  // Auth rate limiting (stricter)
  authRateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
  },
} as const;

// Validate required environment variables in production
export function validateConfig(): void {
  const requiredInProduction = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  if (config.nodeEnv === 'production') {
    for (const key of requiredInProduction) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
    }
  }
}

export default config;
