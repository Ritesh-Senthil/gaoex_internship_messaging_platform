/**
 * Lightweight server health checks (e.g. when Supabase is waking from pause).
 */

import { API_CONFIG } from '../constants/config';

export interface HealthStatus {
  alive: boolean;
  database: 'connected' | 'disconnected' | 'unknown';
}

export async function fetchServerHealth(): Promise<HealthStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${API_CONFIG.SOCKET_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { alive: false, database: 'unknown' };
    }

    const body = await response.json();
    const database =
      body.database === 'connected' || body.database === 'disconnected'
        ? body.database
        : 'unknown';

    return { alive: true, database };
  } catch {
    return { alive: false, database: 'unknown' };
  }
}
