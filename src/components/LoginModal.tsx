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
    setPassword(''); // 切換使用者時，清空原本輸入的密碼
    
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
    try {
      const res = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: String(selectedUser.id), password }),
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
        {/* 關閉按鈕 */}
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white z-10">
          <X size={24} />
        </button>
        
        <h2 className="text-2xl font-semibold text-white mb-6 text-center">
          {selectedUser ? 'Welcome Back' : 'Login'}
        </h2>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-sm text-center animate-in fade-in">
            {errorMsg}
          </div>
        )}

        {/* 狀態一：尚未選擇 User (顯示放大版的選手清單) */}
        {!selectedUser ? (
          availableUsers.length > 0 ? (
            <div className="animate-in fade-in zoom-in-95 duration-300">
              <p className="text-xs text-zinc-500 text-center mb-6 uppercase tracking-wider">Select User</p>
              <div className="flex justify-center gap-6 flex-wrap">
                {availableUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleUserSelect(u)}
                    className="flex flex-col items-center gap-3 group transition-transform active:scale-95 hover:scale-105"
                  >
                    {/* 這裡把初始頭像放大到 w-20 h-20 */}
                    <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-transparent group-hover:border-orange-500 transition-colors shadow-lg">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                          <UserIcon size={32} />
                        </div>
                      )}
                    </div>
                    <span className="text-sm text-zinc-300 font-medium group-hover:text-white transition-colors">{u.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500 text-sm italic">
              Loading users...
            </div>
          )
        ) : (
          /* 狀態二：已選擇 User (顯示超大頭像、密碼輸入、Login按鈕) */
          <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-300">
            
            {/* 放大的大頭照 */}
            <div className="relative mb-8">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-orange-500 shadow-xl shadow-orange-500/20">
                {selectedUser.avatar_url ? (
                  <img src={selectedUser.avatar_url} alt={selectedUser.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                    <UserIcon size={48} />
                  </div>
                )}
              </div>
              {/* 小小的切換帳號按鈕，避免點錯人卡死 */}
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-zinc-800 text-xs text-zinc-300 px-3 py-1 rounded-full border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors whitespace-nowrap shadow-lg"
              >
                切換帳號
              </button>
            </div>

            {/* 密碼表單，移除了 username 欄位 */}
            <form onSubmit={handleLogin} className="w-full space-y-5">
              <div>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  inputMode="numeric" // 手機彈出數字鍵盤
                  pattern="[0-9]*"
                  value={password}
                  onChange={(e) => {
                    // 只允許輸入數字
                    const numericValue = e.target.value.replace(/[^0-9]/g, '');
                    setPassword(numericValue);
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all text-center text-xl tracking-[0.5em] placeholder:tracking-normal"
                  placeholder="請輸入密碼"
                  required
                />
              </div>
              
              <button
                type="submit"
                disabled={loading || !password}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3.5 transition-all shadow-lg shadow-orange-500/20 active:scale-95 text-lg"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}