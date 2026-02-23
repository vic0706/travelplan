import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { User } from '../types';
import { X, User as UserIcon } from 'lucide-react';
import { getApiUrl } from '../utils/api';

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
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

  const handleUserSelect = (u: User) => {
    setSelectedUser(u);
    // Focus password input
    setTimeout(() => {
      const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
      if (passwordInput) {
        passwordInput.focus();
      }
    }, 0);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setLoading(true);
    setErrorMsg('');
    console.log('Frontend Sending:', { username: selectedUser.id, password });
    try {
      const res = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedUser.id, password }),
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

      if (data && data.user && data.token) {
        login(data.user, data.token);
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
            <p className="text-xs text-zinc-500 text-center mb-4 uppercase tracking-wider">Select Your Profile</p>
            <div className="grid grid-cols-3 gap-4">
              {availableUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleUserSelect(u)}
                  className={`flex flex-col items-center gap-2 group transition-all active:scale-95 ${selectedUser?.id === u.id ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
                >
                  <div className={`w-16 h-16 rounded-full overflow-hidden border-4 transition-all ${selectedUser?.id === u.id ? 'border-orange-500 scale-110 shadow-lg shadow-orange-500/20' : 'border-zinc-800 group-hover:border-zinc-600'}`}>
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                        <UserIcon size={24} />
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-zinc-300 font-bold truncate w-full text-center">{u.name}</span>
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
          {selectedUser ? (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <span className="block text-[10px] text-zinc-500 uppercase tracking-widest">Selected User</span>
                <span className="text-white font-bold">{selectedUser.name}</span>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedUser(null)}
                className="text-xs text-orange-500 hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="text-center py-4 text-zinc-500 text-sm italic">
              Please select a user above to continue
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">PIN Code</label>
            <input
              type="password"
              name="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all text-center tracking-widest text-lg"
              placeholder="••••••"
              required
              disabled={!selectedUser}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !selectedUser}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
