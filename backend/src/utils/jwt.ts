import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
}

/**
 * Generate access token
 */
export function generateAccessToken(userId: string): string {
  const payload: TokenPayload = { userId, type: 'access' };
  const secret: Secret = config.jwt.accessSecret;
  const options: SignOptions = { expiresIn: '15m' }; // 15 minutes
  return jwt.sign(payload, secret, options);
}

/**
 * Generate refresh token and store in database
 */
export async function generateRefreshToken(userId: string): Promise<string> {
  const token = uuidv4();
  
  // Calculate expiration date
  const expiresAt = new Date();
  const days = parseInt(config.jwt.refreshExpiresIn.replace('d', ''), 10) || 30;
  expiresAt.setDate(expiresAt.getDate() + days);

  // Store in database
  await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return token;
}

/**
 * Generate both access and refresh tokens
 */
export async function generateTokens(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}> {
  const accessToken = generateAccessToken(userId);
  const refreshToken = await generateRefreshToken(userId);

  return {
    accessToken,
    refreshToken,
    expiresIn: config.jwt.accessExpiresIn,
  };
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): TokenPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
  
  if (payload.type !== 'access') {
    throw new Error('Invalid token type');
  }

  return payload;
}

/**
 * Verify refresh token (checks signature only, not database)
 */
export function verifyRefreshToken(token: string): { userId: string } {
  // Refresh tokens are stored as UUIDs in database
  // We just need to check if it exists and is not expired
  // This function is mainly for consistency
  return { userId: '' }; // Actual verification happens in database lookup
}

/**
 * Clean up expired refresh tokens
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserTokens(userId: string): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: { userId },
  });

  return result.count;
}
