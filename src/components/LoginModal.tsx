import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { User } from '../types';
import { X, User as UserIcon } from 'lucide-react';
import { getApiUrl } from '../utils/api';

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const login = useAppStore((state) => state.login);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(getApiUrl('/api/users/login-list'));
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setAvailableUsers(data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch user list:', error);
      }
    };
    fetchUsers();
  }, []);

  const handleUserSelect = (selectedUser: User) => {
    setUsername(selectedUser.name);
    // Focus password input
    const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
    if (passwordInput) {
      passwordInput.focus();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    console.log('Frontend Sending:', { username, password });
    try {
      const res = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('API returned non-JSON response (likely HTML)');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      if (data && data.user) {
        login(data.user);
        onClose();
      } else {
        setErrorMsg('Login failed: Invalid response');
      }
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white">
          <X size={24} />
        </button>
        <h2 className="text-2xl font-semibold text-white mb-6 text-center">Login</h2>
        
        {/* Avatar Selection */}
        {availableUsers.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-zinc-500 text-center mb-3 uppercase tracking-wider">Select User</p>
            <div className="flex justify-center gap-4 flex-wrap">
              {availableUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleUserSelect(u)}
                  className={`flex flex-col items-center gap-2 group transition-transform active:scale-95 ${username === u.name ? 'opacity-100 scale-110' : 'opacity-70 hover:opacity-100'}`}
                >
                  <div className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-colors ${username === u.name ? 'border-orange-500' : 'border-transparent group-hover:border-zinc-600'}`}>
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                        <UserIcon size={20} />
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-zinc-300 font-medium">{u.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Admin User"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl px-4 py-3 transition-colors mt-2"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
