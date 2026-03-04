import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, Users, RefreshCw, User as UserIcon, Plus, Loader2, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { apiFetch } from '../utils/api';

export function TopAppBar() {
  const { user, isUserMenuOpen, setLoginModalOpen, setUserMenuOpen, logout, setCreateTripModalOpen, setUser } = useAppStore();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image Upload State
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isCleaningCache, setIsCleaningCache] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen, setUserMenuOpen]);

  const handleClearCache = () => {
    if (window.confirm('Are you sure you want to clear cache and reload?')) {
      setIsCleaningCache(true);
      setTimeout(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      }, 1500);
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
    setUserMenuOpen(false);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    
    // Show a brief notification
    const notification = document.createElement('div');
    notification.textContent = 'Logging out...';
    notification.className = 'fixed top-24 left-1/2 -translate-x-1/2 bg-zinc-800 text-white px-6 py-3 rounded-full shadow-2xl z-[100] animate-pulse font-medium border border-zinc-700 flex items-center gap-2';
    
    // Add icon
    const icon = document.createElement('span');
    icon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
    if (notification.firstChild) {
      notification.insertBefore(icon, notification.firstChild);
    } else {
      notification.appendChild(icon);
    }

    document.body.appendChild(notification);
    
    setTimeout(() => {
      logout();
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
      navigate('/');
    }, 800);
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
    // Reset input
    e.target.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    setIsCropperOpen(false);
    setUploadingImage(true);
    try {
      const publicUrl = await uploadImageToSupabase(blob, 'members');
      
      // Update user in backend
      if (user) {
        const res = await apiFetch(`/api/users/${user.id}`, {
          method: 'PUT',
          body: JSON.stringify({ avatar_url: publicUrl })
        });
        
        if (res.ok) {
          // Update local store
          setUser({ ...user, avatar_url: publicUrl });
        }
      }
    } catch (err) {
      console.error(err);
      alert('Failed to upload avatar');
    } finally {
      setUploadingImage(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
    setUserMenuOpen(false);
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-4 flex items-center justify-between safe-top h-[calc(4rem+env(safe-area-inset-top,0px))] pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <h1 className="text-xl font-black tracking-tighter text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.6)] italic hover:scale-105 transition-transform">
            TRAVEL PLAN
          </h1>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!isUserMenuOpen)}
            className={clsx(
              "p-0.5 rounded-full transition-all relative group",
              user ? "text-white" : "text-zinc-400 hover:text-white"
            )}
          >
            {user ? (
              <div className="relative">
                 <div className="absolute inset-0 bg-orange-500 rounded-full blur-md opacity-50 animate-pulse"></div>
                 <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-orange-500 relative z-10">
                   <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                 </div>
              </div>
            ) : (
              <div className="p-2 hover:bg-zinc-900 rounded-full">
                <Settings size={24} />
              </div>
            )}
          </button>

          {/* User Menu Dropdown */}
          <AnimatePresence>
            {isUserMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                className="absolute right-0 top-full mt-4 w-64 bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden origin-top-right z-50"
              >
                {user ? (
                  <>
                    <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-orange-500/50">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-orange-500">
                            <UserIcon size={20} />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{user.name}</p>
                        <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">{user.role}</p>
                      </div>
                    </div>
                    <div className="p-1 space-y-0.5">

                      {user.role === 'Admin' && (
                        <>
                          <button 
                            onClick={() => {
                              setCreateTripModalOpen(true);
                              setUserMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                          >
                            <Plus size={16} />
                            New Trip
                          </button>
                          <button 
                            onClick={() => {
                              navigate('/admin/members');
                              setUserMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                          >
                            <Users size={16} />
                            Member Management
                          </button>
                          <button 
                            onClick={() => {
                              navigate('/admin/settings');
                              setUserMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                          >
                            <Settings size={16} />
                            System Settings
                          </button>
                        </>
                      )}
                      
                      <label 
                        htmlFor="avatar-upload-topbar"
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium cursor-pointer"
                      >
                        {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                        Change Avatar
                      </label>

                      <button 
                        onClick={() => {
                          handleClearCache();
                          setUserMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                      >
                        <RefreshCw size={16} />
                        Clear Cache & Reload
                      </button>

                      <div className="h-px bg-zinc-800 my-1 mx-2"></div>
                      <button
                        onClick={handleLogoutClick}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-left font-medium"
                      >
                        <LogOut size={16} />
                        Sign Out
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-1 space-y-0.5">
                    <button
                      onClick={() => {
                        setLoginModalOpen(true);
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-colors text-left font-bold justify-center mb-2 shadow-lg shadow-orange-500/20"
                    >
                      Sign In
                    </button>
                    <button 
                      onClick={() => {
                        handleClearCache();
                        setUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors text-left font-medium"
                    >
                      <RefreshCw size={16} />
                      Clear Cache & Reload
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Hidden File Input */}
      <input 
        type="file" 
        id="avatar-upload-topbar"
        className="hidden" 
        accept="image/*" 
        onChange={handleFileSelect} 
      />

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white mb-2">Sign Out?</h3>
              <p className="text-zinc-400 mb-6">Are you sure you want to sign out of your account?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                >
                  Sign Out
                </button>
              </div>
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

      {/* Cleaning Cache Overlay */}
      {isCleaningCache && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center">
          <Loader2 size={48} className="text-orange-500 animate-spin mb-4" />
          <h3 className="text-xl font-bold text-white">Cleaning Cache...</h3>
          <p className="text-zinc-400 mt-2">The application will reload shortly.</p>
        </div>
      )}
    </>
  );
}