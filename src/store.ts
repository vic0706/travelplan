import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { City } from './types';

export type Role = 'Guest' | 'Member' | 'Admin';

export interface User {
  id: number;
  role: Role;
  name: string;
  avatar_url?: string;
  allow_login?: number;
}

interface AppState {
  user: User | null;
  token: string | null;
  cities: City[];
  isLoginModalOpen: boolean;
  isUserMenuOpen: boolean;
  isCreateTripModalOpen: boolean;
  _hasHydrated: boolean;
  
  login: (user: User, token: string) => void;
  logout: () => void;
  setCities: (cities: City[]) => void;
  setLoginModalOpen: (isOpen: boolean) => void;
  setUserMenuOpen: (isOpen: boolean) => void;
  setCreateTripModalOpen: (isOpen: boolean) => void;
  setHasHydrated: (hasHydHydrated: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      cities: [],
      isLoginModalOpen: false,
      isUserMenuOpen: false,
      isCreateTripModalOpen: false,
      _hasHydrated: false,
      
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      setCities: (cities) => set({ cities }),
      setLoginModalOpen: (isOpen) => set({ isLoginModalOpen: isOpen }),
      setUserMenuOpen: (isOpen) => set({ isUserMenuOpen: isOpen }),
      setCreateTripModalOpen: (isOpen) => set({ isCreateTripModalOpen: isOpen }),
      setHasHydrated: (hasHydrated) => set({ _hasHydrated: hasHydrated }),
    }),
    {
      name: 'travel-plan-storage',
      partialize: (state) => ({ user: state.user, token: state.token }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
