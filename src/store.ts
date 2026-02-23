import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'Guest' | 'Member' | 'Admin';

export interface User {
  id: number;
  role: Role;
  name: string;
  avatar_url?: string;
  allow_login?: number;
}

interface SyncItem {
  type: 'itinerary' | 'expense';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: number;
}

interface AppState {
  user: User | null;
  token: string | null;
  isLoginModalOpen: boolean;
  isUserMenuOpen: boolean;
  isCreateTripModalOpen: boolean;
  syncQueue: SyncItem[];
  
  login: (user: User, token: string) => void;
  logout: () => void;
  setLoginModalOpen: (isOpen: boolean) => void;
  setUserMenuOpen: (isOpen: boolean) => void;
  setCreateTripModalOpen: (isOpen: boolean) => void;
  addToSyncQueue: (item: SyncItem) => void;
  clearSyncQueue: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoginModalOpen: false,
      isUserMenuOpen: false,
      isCreateTripModalOpen: false,
      syncQueue: [],
      
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      setLoginModalOpen: (isOpen) => set({ isLoginModalOpen: isOpen }),
      setUserMenuOpen: (isOpen) => set({ isUserMenuOpen: isOpen }),
      setCreateTripModalOpen: (isOpen) => set({ isCreateTripModalOpen: isOpen }),
      addToSyncQueue: (item) => set((state) => ({ syncQueue: [...state.syncQueue, item] })),
      clearSyncQueue: () => set({ syncQueue: [] }),
    }),
    {
      name: 'travel-plan-storage',
      partialize: (state) => ({ user: state.user, token: state.token, syncQueue: state.syncQueue }),
    }
  )
);
