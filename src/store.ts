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
  // 💡 新增：儲存活動分類
  categories: any[];
  isLoginModalOpen: boolean;
  isUserMenuOpen: boolean;
  isCreateTripModalOpen: boolean;
  _hasHydrated: boolean;
  
  login: (user: User, token: string) => void;
  logout: () => void;
  setCities: (cities: City[]) => void;
  // 💡 新增：設定分類的方法
  setCategories: (categories: any[]) => void;
  setLoginModalOpen: (isOpen: boolean) => void;
  setUserMenuOpen: (isOpen: boolean) => void;
  setCreateTripModalOpen: (isOpen: boolean) => void;
  setHasHydrated: (hasHydHydrated: boolean) => void;
  setUser: (user: User | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      cities: [],
      categories: [], // 預設空陣列
      isLoginModalOpen: false,
      isUserMenuOpen: false,
      isCreateTripModalOpen: false,
      _hasHydrated: false,
      
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      setCities: (cities) => set({ cities }),
      setCategories: (categories) => set({ categories }), // 實作設定方法
      setLoginModalOpen: (isOpen) => set({ isLoginModalOpen: isOpen }),
      setUserMenuOpen: (isOpen) => set({ isUserMenuOpen: isOpen }),
      setCreateTripModalOpen: (isOpen) => set({ isCreateTripModalOpen: isOpen }),
      setHasHydrated: (hasHydrated) => set({ _hasHydrated: hasHydrated }),
      setUser: (user) => set({ user }),
    }),
    {
      name: 'travel-plan-storage',
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token,
        categories: state.categories // 持久化儲存分類，下次開啟更快
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);