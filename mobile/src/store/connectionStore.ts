/**
 * Connection Store using Zustand
 * Tracks socket + API server status for UI indicators
 */

import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';
export type ServerStatus = 'ok' | 'unavailable' | 'waking';

interface ConnectionState {
  status: ConnectionStatus;
  serverStatus: ServerStatus;
  setConnected: () => void;
  setConnecting: () => void;
  setDisconnected: () => void;
  setServerOk: () => void;
  setServerUnavailable: () => void;
  setServerWaking: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'connecting',
  serverStatus: 'ok',

  setConnected: () => set({ status: 'connected' }),
  setConnecting: () => set({ status: 'connecting' }),
  setDisconnected: () => set({ status: 'disconnected' }),
  setServerOk: () => set({ serverStatus: 'ok' }),
  setServerUnavailable: () => set({ serverStatus: 'unavailable' }),
  setServerWaking: () => set({ serverStatus: 'waking' }),
}));
