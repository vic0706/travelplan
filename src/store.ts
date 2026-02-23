import { create } from 'zustand';

export type Role = 'Guest' | 'Editor' | 'Admin';

export interface User {
  id: string;
  role: Role;
  name: string;
}

interface AppState {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
}));
