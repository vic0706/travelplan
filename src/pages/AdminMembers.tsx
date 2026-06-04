import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { Shield, User as UserIcon, Plus, X, Loader2, Edit2, Camera } from 'lucide-react';
import { clsx } from 'clsx';
import { apiFetch } from '../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { ImageCropper, uploadImageToSupabase } from '../components/widgets/ImageCropper';

export function AdminMembers() {
  const [users, setUsers] = useState<any[]>([]);
  const { user } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    password: '', 
    role: 'Member', 
    allow_login: 1,
    avatar_url: '',
    payment_info: { bank_accounts: [] as { bank_code: string, account: string }[] }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Image Upload State
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const sortUsers = (usersList: any[]) => {
    return [...usersList].sort((a, b) => {
      // 1. Active first (allow_login === 1)
      const aActive = a.allow_login === 1;
      const bActive = b.allow_login === 1;
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;

      // 2. Admin first
      if (a.role === 'Admin' && b.role !== 'Admin') return -1;
      if (a.role !== 'Admin' && b.role === 'Admin') return 1;

      return 0;
    });
  };

  const fetchUsers = async () => {
    try {
      const res = await apiFetch('/api/users');
      if (res.ok) {
        const data = await res.json() as any[];
        setUsers(sortUsers(data));
      }
    } catch (err) {
      console.error('Users fetch failed:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({ 
      name: '', 
      password: '123456', 
      role: 'Member', 
      allow_login: 1,
      avatar_url: '',
      payment_info: { bank_accounts: [] }
    });
    setIsModalOpen(true);
  };

  const openEditModal = (u: any) => {
    setEditingUser(u);
    let paymentInfo = { bank_accounts: [] };
    try {
      if (u.payment_info) {
        const parsed = typeof u.payment_info === 'string' ? JSON.parse(u.payment_info) : u.payment_info;
        // Migrate old data if needed, or just extract bank_accounts
        paymentInfo = { bank_accounts: parsed.bank_accounts || [] };
      }
    } catch (e) {}
    
    setFormData({ 
      name: u.name, 
      password: '', 
      role: u.role, 
      allow_login: u.allow_login,
      avatar_url: u.avatar_url || '',
      payment_info: paymentInfo
    });
    setIsModalOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setIsCropperOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCropComplete = async (blob: Blob) => {
    setIsCropperOpen(false);
    setUploadingImage(true);
    try {
      const publicUrl = await uploadImageToSupabase(blob, 'members');
      setFormData({ ...formData, avatar_url: publicUrl });
    } catch (err) {
      console.error(err);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';
      
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Operation failed');
      }

      const savedUser = await res.json();

      if (editingUser) {
        const updatedUsers = users.map(u => u.id === editingUser.id ? { ...u, ...formData, id: editingUser.id, avatar_url: editingUser.avatar_url } : u);
        setUsers(sortUsers(updatedUsers));
      } else {
        // The server returns the newly created user with an ID
        const newUsers = [...users, savedUser];
        setUsers(sortUsers(newUsers));
      }

      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'Admin') return <div className="p-8 text-center text-zinc-500">Access Denied</div>;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 bg-black min-h-screen">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold text-white tracking-tight">Members</h2>
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-xs font-bold uppercase tracking-wider rounded-full hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
        >
          <Plus size={16} />
          Add Member
        </button>
      </div>

      <div className="space-y-4">
        {users.map(u => {
          const isDisabled = u.allow_login !== 1;
          return (
            <div
              key={u.id}
              className={clsx(
                "bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex items-center justify-between transition-all hover:border-zinc-700",
                isDisabled && "opacity-50 grayscale"
              )}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden border border-zinc-700">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="text-zinc-400" size={20} />
                  )}
                </div>
                <div>
                  <h3 className="text-white font-medium">{u.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Shield size={12} className={u.role === 'Admin' ? 'text-orange-500' : 'text-zinc-500'} />
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{u.role}</span>
                    {isDisabled && <span className="text-[10px] text-red-500 font-bold uppercase ml-2">Disabled</span>}
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => openEditModal(u)}
                className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-colors"
              >
                <Edit2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Member Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                <h2 className="text-xl font-bold text-white">{editingUser ? 'Edit Member' : 'Add New Member'}</h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {/* Avatar Upload */}
                <div className="flex justify-center mb-6">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 group-hover:border-orange-500 transition-colors">
                      {formData.avatar_url ? (
                        <img src={formData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-500">
                          <UserIcon size={40} />
                        </div>
                      )}
                    </div>
                    <label className="absolute bottom-0 right-0 p-2 bg-orange-500 rounded-full text-white cursor-pointer hover:bg-orange-600 transition-colors shadow-lg">
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleFileSelect}
                      />
                      {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="John Doe"
                  />
                </div>

                {editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                      New Password (leave blank to keep current)
                    </label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="••••••••"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Role</label>
                    <select
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="Member">Member</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Status</label>
                    <select
                      value={formData.allow_login}
                      onChange={e => setFormData({ ...formData, allow_login: Number(e.target.value) })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value={1}>Active</option>
                      <option value={0}>Disabled</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Payment Info</h3>
                  
                  {/* Bank Accounts Only */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-500">Bank Accounts</label>
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          payment_info: {
                            ...formData.payment_info,
                            bank_accounts: [...(formData.payment_info?.bank_accounts || []), { bank_code: '', account: '' }]
                          }
                        })}
                        className="text-xs text-orange-500 font-bold hover:text-orange-400"
                      >
                        + Add Bank
                      </button>
                    </div>
                    
                    {formData.payment_info?.bank_accounts?.map((bank, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={bank.bank_code}
                          onChange={e => {
                            const newBanks = [...(formData.payment_info.bank_accounts || [])];
                            newBanks[idx].bank_code = e.target.value;
                            setFormData({ ...formData, payment_info: { ...formData.payment_info, bank_accounts: newBanks } });
                          }}
                          className="w-24 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="Bank Code"
                        />
                        <input
                          type="text"
                          value={bank.account}
                          onChange={e => {
                            const newBanks = [...(formData.payment_info.bank_accounts || [])];
                            newBanks[idx].account = e.target.value;
                            setFormData({ ...formData, payment_info: { ...formData.payment_info, bank_accounts: newBanks } });
                          }}
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          placeholder="Account Number"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newBanks = formData.payment_info.bank_accounts.filter((_, i) => i !== idx);
                            setFormData({ ...formData, payment_info: { ...formData.payment_info, bank_accounts: newBanks } });
                          }}
                          className="p-2 text-zinc-500 hover:text-red-500"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white font-medium rounded-xl px-4 py-3 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95"
                  >
                    {loading ? 'Saving...' : (editingUser ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Cropper Modal */}
      {isCropperOpen && selectedImage && (
        <ImageCropper
          imageSrc={selectedImage}
          aspect={1}
          onCropComplete={handleCropComplete}
          onCancel={() => {
            setIsCropperOpen(false);
            setSelectedImage(null);
          }}
        />
      )}
    </div>
  );
}
