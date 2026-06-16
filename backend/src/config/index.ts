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

  // Auth (login) rate limiting — IP based. Kept moderate because a cohort can
  // share one NAT IP (SEC-06).
  authRateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 sign-in attempts per minute per IP
  },
} as const;

// Validate required environment variables in production
export function validateConfig(): void {
  if (config.nodeEnv !== 'production') return;

  const requiredInProduction = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    // Firebase Admin credentials are required to verify sign-ins (INF-04).
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
  ];

  for (const key of requiredInProduction) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  // Never allow development default secrets in production (SEC-09).
  if (config.jwt.accessSecret === 'dev-access-secret') {
    throw new Error('JWT secrets must not use development defaults in production');
  }
}

export default config;
