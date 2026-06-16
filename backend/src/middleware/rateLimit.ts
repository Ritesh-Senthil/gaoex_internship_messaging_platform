/**
 * Rate limiting middleware (SEC-06).
 *
 * Design note: InternHub users frequently share a network (a cohort on the same
 * office/campus wifi sits behind one NAT IP). A blunt global per-IP limit would
 * throttle legitimate co-located users, so we deliberately:
 *   - Apply IP-based limits ONLY to sensitive low-volume endpoints (login).
 *   - Rate-limit chatty actions (sending messages) PER USER, not per IP.
 */

import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { config } from '../config';

const errorBody = (message: string) => ({
  success: false,
  error: { message },
});

/**
 * Strict IP-based limiter for the login endpoint — brute-force protection.
 * Login is rare per user, so a tight per-IP budget is safe even behind NAT.
 */
export const loginRateLimiter = rateLimit({
  windowMs: config.authRateLimit.windowMs,
  max: config.authRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: errorBody('Too many sign-in attempts. Please try again in a minute.'),
});

/**
 * Per-user limiter for message sending / uploads — anti-spam without penalizing
 * users who share an IP. Falls back to IP only for unauthenticated requests
 * (which these routes reject anyway).
 */
export const messageRateLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'unknown',
  message: errorBody('You are sending messages too quickly. Please slow down.'),
});
