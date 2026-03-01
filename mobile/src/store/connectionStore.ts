/**
 * Connection Store using Zustand
 * Tracks socket connection status for UI indicators
 */

import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface ConnectionState {
  status: ConnectionStatus;
  setConnected: () => void;
  setConnecting: () => void;
  setDisconnected: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'connecting',

  setConnected: () => set({ status: 'connected' }),
  setConnecting: () => set({ status: 'connecting' }),
  setDisconnected: () => set({ status: 'disconnected' }),
}));
