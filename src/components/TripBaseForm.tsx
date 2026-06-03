import React, { useState, useEffect, useRef } from 'react';
import { useAppStore, User } from '../store';
import { Image as ImageIcon, MapPin, Users, Loader2, Check, Globe, ChevronDown, ChevronUp, Lock as LockIcon } from 'lucide-react';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { LocationPicker } from './LocationPicker';
import { DateRangePicker } from './DateRangePicker';
import { apiFetch } from '../utils/api';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export interface TripFormData {
  title: string;
  start_date: string;
  end_date: string;
  default_city_id: number | null;
  cover_image_url: string;
  currencies: string[];
  members: number[];
  is_public: number;
}

interface TripBaseFormProps {
  initialData?: Partial<TripFormData>;
  onSubmit: (data: TripFormData) => Promise<void>;
  onCancel?: () => void;
  submitText: string;
  loading?: boolean;
  extraButtons?: React.ReactNode;
  /** 當提供此 callback 時，表單資料每次變更後會 debounce 1.2s 自動呼叫 */
  onChange?: (data: TripFormData) => void;
  /** 設為 true 可隱藏 Submit 按鈕（配合 onChange 自動儲存使用） */
  hideSubmit?: boolean;
}

const COMMON_CURRENCIES = ['TWD', 'JPY', 'USD', 'KRW', 'EUR', 'GBP', 'AUD', 'THB', 'VND', 'HKD', 'CNY'];

// 安全解析陣列工具
const safeParseArray = (data: any) => {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'string') return ['TWD'];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : ['TWD'];
  } catch (e) {
    return ['TWD'];
  }
};

const parseInitialMembers = (membersData: any, currentUserId?: number) => {
  if (!Array.isArray(membersData)) return currentUserId ? [currentUserId] : [];
  return membersData.map(m => (typeof m === 'object' && m !== null ? m.user_id : m));
};

export function TripBaseForm({ initialData, onSubmit, onCancel, submitText, loading = false, extraButtons, onChange, hideSubmit = false }: TripBaseFormProps) {
  const { cities, user } = useAppStore();

  const [formData, setFormData] = useState<TripFormData>({
    title: initialData?.title || '',
    start_date: initialData?.start_date || '',
    end_date: initialData?.end_date || '',
    default_city_id: initialData?.default_city_id || null,
    cover_image_url: initialData?.cover_image_url || '',
    currencies: safeParseArray(initialData?.currencies),
    members: parseInitialMembers(initialData?.members, user?.id),
    is_public: initialData?.is_public ?? 0,
  });

  const [uploading, setUploading] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);

  // ✅ Auto-save: 使用 ref 追蹤最新 onChange，避免 stale closure
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // ✅ Auto-save: 跳過第一次 render，之後每次 formData 變化 debounce 1.2s 後呼叫 onChange
  const isFirstRender = useRef(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!onChangeRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChangeRef.current?.(formData);
    }, 1200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [formData]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiFetch('/api/users');
        if (res.ok) setAvailableUsers(await res.json());
      } catch (e) {
        console.error('Failed to fetch users');
      }
    };
    fetchUsers();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCroppingImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCroppingImage(null);
    setUploading(true);
    try {
      const publicUrl = await uploadImageToSupabase(croppedBlob, 'trips');
      setFormData(prev => ({ ...prev, cover_image_url: publicUrl }));
    } catch (err: any) {
      alert('Failed to upload image: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleMember = (userId: number) => {
    setFormData(prev => ({
      ...prev,
      members: prev.members.includes(userId)
        ? prev.members.filter(id => id !== userId)
        : [...prev.members, userId]
    }));
  };

  const toggleCurrency = (currency: string) => {
    setFormData(prev => {
      const current = prev.currencies || [];
      if (current.includes(currency)) {
        if (current.length === 1) return prev; 
        return { ...prev, currencies: current.filter(c => c !== currency) };
      } else {
        return { ...prev, currencies: [...current, currency] };
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.start_date || !formData.end_date) {
      alert('Please fill in all required fields.');
      return;
    }
    await onSubmit(formData);
  };

  const groupedCities = cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* Cover Image */}
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Cover Image</label>
        <div className="relative aspect-[21/9] w-full bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-700 group cursor-pointer">
          {formData.cover_image_url ? (
            <>
              <img src={formData.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white font-medium bg-black/50 px-4 py-2 rounded-xl backdrop-blur-md">Change Image</span>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
              <ImageIcon size={32} className="mb-2 opacity-50" />
              <span className="text-sm font-medium">Click to upload cover image</span>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm z-10">
              <Loader2 className="animate-spin text-orange-500 mb-2" size={28} />
              <span className="text-sm text-white font-medium">Uploading...</span>
            </div>
          )}
        </div>
      </div>

      {/* Trip Title */}
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Trip Title *</label>
        <input
          type="text"
          required
          value={formData.title}
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
          placeholder="e.g., Summer in Tokyo"
        />
      </div>

      {/* Date Range */}
      <div className="w-full">
        <DateRangePicker
          label="Schedule *"
          hideTime={true}
          value={{
            start_date: formData.start_date ? parseISO(formData.start_date) : null,
            end_date: formData.end_date ? parseISO(formData.end_date) : null,
            start_time: '10:00',
            end_time: '10:00'
          }}
          onChange={range => setFormData({
            ...formData,
            start_date: range.start_date ? format(range.start_date, 'yyyy-MM-dd') : '',
            end_date: range.end_date ? format(range.end_date, 'yyyy-MM-dd') : ''
          })}
        />
      </div>

      {/* Default City */}
      <div className="w-full">
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
           Default City
        </label>
        <button
          type="button"
          onClick={() => setIsLocationPickerOpen(true)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between hover:border-zinc-500 transition-colors focus:outline-none focus:border-orange-500"
        >
          <div className="flex items-center gap-3 w-full">
            <MapPin size={18} className="text-orange-500 shrink-0" />
            <span className={clsx("truncate text-sm font-medium", formData.default_city_id ? "text-white" : "text-zinc-500")}>
              {formData.default_city_id ? cities.find(c => c.id === formData.default_city_id)?.name : 'Select city...'}
            </span>
          </div>
          <ChevronDown size={16} className="text-zinc-500 shrink-0" />
        </button>
      </div>

      {/* Supported Currencies */}
      <div className="w-full">
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Globe size={14} /> Supported Currencies
        </label>
        <button
          type="button"
          onClick={() => setIsCurrencyOpen(!isCurrencyOpen)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between hover:border-zinc-500 transition-colors focus:outline-none"
        >
          <div className="flex flex-wrap gap-1.5">
            {formData.currencies.map(c => (
              <span key={c} className="bg-orange-500/20 text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded-md text-[10px] font-bold">
                {c}
              </span>
            ))}
          </div>
          {isCurrencyOpen ? <ChevronUp size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
        </button>

        <AnimatePresence>
          {isCurrencyOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 mt-2 flex flex-wrap gap-2">
                {COMMON_CURRENCIES.map(curr => {
                  const isSelected = formData.currencies.includes(curr);
                  return (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => toggleCurrency(curr)}
                      className={clsx(
                        "px-3.5 py-2 rounded-xl text-xs font-bold transition-all border",
                        isSelected
                          ? "bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-500/20"
                          : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
                      )}
                    >
                      {curr}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Trip Members */}
      <div>
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Users size={14} /> Trip Members
        </label>
        <button
          type="button"
          onClick={() => setIsMembersOpen(!isMembersOpen)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 flex items-center justify-between hover:border-zinc-500 transition-colors focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <span className="bg-zinc-700 text-white text-xs font-bold px-2 py-0.5 rounded-full">{formData.members.length}</span>
            <span className="text-sm font-medium text-zinc-300">Members Selected</span>
          </div>
          {isMembersOpen ? <ChevronUp size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
        </button>

        <AnimatePresence>
          {isMembersOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-2 mt-2 max-h-[180px] overflow-y-auto custom-scrollbar">
                {availableUsers.map(u => {
                  const isSelected = formData.members.includes(u.id);
                  const isSelf = u.id === user?.id;
                  return (
                    <label key={u.id} className={clsx("flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors", isSelected ? "bg-orange-500/10" : "hover:bg-zinc-700/50", isSelf && "opacity-70 pointer-events-none")}>
                      <div className="flex items-center gap-3">
                        {u.avatar_url ? <img src={u.avatar_url} alt={u.name} className="w-8 h-8 rounded-full object-cover border border-zinc-700" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white border border-zinc-600">{u.name.charAt(0).toUpperCase()}</div>}
                        <div>
                          <div className="text-sm font-bold text-white">
                            {u.name} 
                            {isSelf && <span className="text-[10px] text-orange-400 font-bold ml-1 uppercase">(You / Admin)</span>}
                          </div>
                          <div className="text-[10px] text-zinc-500">{u.role}</div>
                        </div>
                      </div>
                      <div className={clsx("w-5 h-5 rounded flex items-center justify-center border transition-colors", isSelected ? "bg-orange-500 border-orange-500 text-white" : "border-zinc-600")}>
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>
                      <input type="checkbox" className="hidden" checked={isSelected} onChange={() => !isSelf && toggleMember(u.id)} disabled={isSelf} />
                    </label>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 💡 Privacy Setting (Public / Private) */}
      <div className="w-full">
        <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          Privacy Setting
        </label>
        <button
          type="button"
          onClick={() => setFormData(prev => ({ ...prev, is_public: prev.is_public ? 0 : 1 }))}
          className={clsx(
            "w-full rounded-xl px-4 py-3.5 flex items-center justify-between transition-colors border focus:outline-none",
            formData.is_public 
              ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20" 
              : "bg-zinc-800 border-zinc-700 hover:border-zinc-500"
          )}
        >
          <div className="flex items-center gap-3">
            {formData.is_public ? <Globe size={20} className="text-emerald-500 shrink-0" /> : <LockIcon size={20} className="text-zinc-500 shrink-0" />}
            <div className="flex flex-col items-start text-left">
              <span className={clsx("text-sm font-bold", formData.is_public ? "text-emerald-500" : "text-zinc-300")}>
                {formData.is_public ? 'Public Trip' : 'Private Trip'}
              </span>
              <span className="text-[10px] text-zinc-500 mt-0.5">
                {formData.is_public ? 'Anyone with the link can view (Read-only)' : 'Only invited members can access'}
              </span>
            </div>
          </div>
          {/* iOS-style Switch */}
          <div className={clsx("w-11 h-6 rounded-full relative transition-colors shrink-0", formData.is_public ? "bg-emerald-500" : "bg-zinc-700")}>
            <div className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm", formData.is_public ? "right-1" : "left-1")} />
          </div>
        </button>
      </div>

      {/* ✅ Action Buttons - 當 hideSubmit=true 時隱藏 Submit 按鈕 */}
      {(!hideSubmit || extraButtons) && (
        <div className={`flex flex-col gap-3 ${!hideSubmit ? 'pt-6 border-t border-zinc-800' : ''}`}>
          {!hideSubmit && (
            <div className="flex gap-3">
              {onCancel && (
                <button type="button" onClick={onCancel} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl px-4 py-3.5 transition-colors">
                  Cancel
                </button>
              )}
              <button type="submit" disabled={loading || uploading} className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black uppercase tracking-widest text-sm rounded-xl px-4 py-3.5 transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="animate-spin" size={20} /> : submitText}
              </button>
            </div>
          )}

          {extraButtons && (
            <div className={hideSubmit ? '' : 'w-full mt-2'}>
              {extraButtons}
            </div>
          )}
        </div>
      )}

      <LocationPicker
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        onSelect={(res) => setFormData({ ...formData, default_city_id: res.id || null })}
        groupedCities={groupedCities}
      />

      {croppingImage && (
        <div className="fixed inset-0 z-[9999] bg-black/90 p-4 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="w-full max-w-md h-[60vh] relative bg-zinc-950 rounded-[32px] overflow-hidden shadow-2xl border border-zinc-800">
            <ImageCropper imageSrc={croppingImage} aspect={21 / 9} onCropComplete={handleCropComplete} onCancel={() => setCroppingImage(null)} />
          </div>
        </div>
      )}
    </form>
  );
}