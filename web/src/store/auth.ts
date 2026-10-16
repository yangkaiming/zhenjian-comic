import { create } from 'zustand';
import { api, getToken, setToken } from '../api';
import type { UserInfo } from '../types';

interface AuthState {
  user: UserInfo | null;
  token: string;
  ready: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<UserInfo>;
  register: (username: string, password: string, nickname?: string) => Promise<UserInfo>;
  logout: () => void;
  patch: (u: UserInfo) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  ready: false,
  async init() {
    const token = getToken();
    if (!token) {
      set({ user: null, token: '', ready: true });
      return;
    }
    try {
      const { user } = await api.me();
      set({ user, token, ready: true });
    } catch {
      setToken('');
      set({ user: null, token: '', ready: true });
    }
  },
  async login(username, password) {
    const { token, user } = await api.login(username, password);
    setToken(token);
    set({ token, user, ready: true });
    return user;
  },
  async register(username, password, nickname) {
    const { token, user } = await api.register(username, password, nickname);
    setToken(token);
    set({ token, user, ready: true });
    return user;
  },
  logout() {
    setToken('');
    set({ user: null, token: '', ready: true });
  },
  patch(u) {
    set({ user: u });
  },
}));
