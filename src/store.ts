import { create } from 'zustand';

export type Role = 'Guest' | 'Editor' | 'Admin';

export interface User {
  id: string;
  role: Role;
  name: string;
  avatar_url?: string;
}

interface AppState {
  user: User | null;
  isLoginModalOpen: boolean;
  isUserMenuOpen: boolean;
  isCreateTripModalOpen: boolean;
  login: (user: User) => void;
  logout: () => void;
  setLoginModalOpen: (isOpen: boolean) => void;
  setUserMenuOpen: (isOpen: boolean) => void;
  setCreateTripModalOpen: (isOpen: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  isLoginModalOpen: false,
  isUserMenuOpen: false,
  isCreateTripModalOpen: false,
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
  setLoginModalOpen: (isOpen) => set({ isLoginModalOpen: isOpen }),
  setUserMenuOpen: (isOpen) => set({ isUserMenuOpen: isOpen }),
  setCreateTripModalOpen: (isOpen) => set({ isCreateTripModalOpen: isOpen }),
}));
