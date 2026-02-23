import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'Guest' | 'Member' | 'Admin';

export interface User {
  id: string;
  role: Role;
  name: string;
  avatar_url?: string;
  allow_login?: number;
}

interface AppState {
  user: User | null;
  token: string | null;
  isLoginModalOpen: boolean;
  isUserMenuOpen: boolean;
  isCreateTripModalOpen: boolean;
  
  login: (user: User, token: string) => void;
  logout: () => void;
  setLoginModalOpen: (isOpen: boolean) => void;
  setUserMenuOpen: (isOpen: boolean) => void;
  setCreateTripModalOpen: (isOpen: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoginModalOpen: false,
      isUserMenuOpen: false,
      isCreateTripModalOpen: false,
      
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      setLoginModalOpen: (isOpen) => set({ isLoginModalOpen: isOpen }),
      setUserMenuOpen: (isOpen) => set({ isUserMenuOpen: isOpen }),
      setCreateTripModalOpen: (isOpen) => set({ isCreateTripModalOpen: isOpen }),
    }),
    {
      name: 'travel-plan-storage',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
