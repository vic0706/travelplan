import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { City, User } from './types'; // ✅ 修正：從 types.ts 統一 import，不再重複定義

// ✅ 保留 Role 型別（types.ts 的 role 是 string，這裡給更嚴格的字面量型別）
export type Role = 'Guest' | 'Member' | 'Admin';

// ✅ 移除舊的 User 定義，改直接 re-export 讓其他檔案方便 import
export type { User };

interface AppState {
  user: User | null;
  token: string | null;
  cities: City[];
  categories: any[];
  isLoginModalOpen: boolean;
  isUserMenuOpen: boolean;
  isCreateTripModalOpen: boolean;
  _hasHydrated: boolean;
  
  login: (user: User, token: string) => void;
  logout: () => void;
  setCities: (cities: City[]) => void;
  setCategories: (categories: any[]) => void;
  setLoginModalOpen: (isOpen: boolean) => void;
  setUserMenuOpen: (isOpen: boolean) => void;
  setCreateTripModalOpen: (isOpen: boolean) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setUser: (user: User | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      cities: [],
      categories: [],
      isLoginModalOpen: false,
      isUserMenuOpen: false,
      isCreateTripModalOpen: false,
      _hasHydrated: false,
      
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      setCities: (cities) => set({ cities }),
      setCategories: (categories) => set({ categories }),
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
        categories: state.categories
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);