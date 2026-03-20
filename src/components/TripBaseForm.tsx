import React, { useState, useEffect } from 'react';
import { useAppStore, User } from '../store';
import { Image as ImageIcon, MapPin, Calendar, Users, Loader2, Check } from 'lucide-react';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { LocationPicker } from './LocationPicker';
import { DateRangePicker } from './DateRangePicker';
import { apiFetch } from '../utils/api';
import { clsx } from 'clsx';
import { format, parseISO } from 'date-fns';

export interface TripFormData {
  title: string;
  start_date: string;
  end_date: string;
  default_city_id: number | null;
  cover_image_url: string;
  currencies: string[];
  members: number[];
}

interface TripBaseFormProps {
  initialData?: Partial<TripFormData>;
  onSubmit: (data: TripFormData) => Promise<void>;
  onCancel?: () => void;
  submitText: string;
  loading?: boolean;
  extraButtons?: React.ReactNode;
}

const COMMON_CURRENCIES = ['TWD', 'USD', 'JPY', 'EUR', 'GBP', 'AUD', 'CAD', 'CNY', 'HKD', 'KRW'];

export function TripBaseForm({ initialData, onSubmit, onCancel, submitText, loading = false, extraButtons }: TripBaseFormProps) {
  const { cities, user } = useAppStore();
  
  // 表單狀態
  const [formData, setFormData] = useState<TripFormData>({
    title: initialData?.title || '',
    start_date: initialData?.start_date || '',
    end_date: initialData?.end_date || '',
    default_city_id: initialData?.default_city_id || null,
    cover_image_url: initialData?.cover_image_url || '',
    currencies: initialData?.currencies || ['TWD'],
    members: initialData?.members || (user?.id ? [user.id] : []),
  });

  // UI 控制狀態
  const [uploading, setUploading] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  // 抓取可用的使用者列表 (用於邀請旅伴)
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiFetch('/api/users');
        if (res.ok) setAvailableUsers(await res.json());
      } catch (e) { console.error('Failed to fetch users'); }
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
      const publicUrl = await uploadImageToSupabase(croppedBlob);
      setFormData(prev => ({ ...prev, cover_image_url: publicUrl }));
    } catch (err: any) { alert('Failed to upload image: ' + err.message); }
    finally { setUploading(false); }
  };

  const toggleMember = (userId: number) => {
    setFormData(prev => ({
      ...prev,
      members: prev.members.includes(userId)
        ? prev.members.filter(id => id !== userId)
        : [...prev.members, userId]
    }));
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
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Cover Image</label>
        <div className="relative h-48 bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-700 group">
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
          <input type="file" accept="image/*" onChange={handleFileSelect} disabled={uploading} className="absolute inset-0 opacity-0 cursor-pointer" />
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm z-10">
              <Loader2 className="animate-spin text-orange-500 mb-2" size={28} />
              <span className="text-sm text-white font-medium">Uploading...</span>
            </div>
          )}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Trip Title *</label>
        <input 
          type="text" required value={formData.title} 
          onChange={e => setFormData({ ...formData, title: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-orange-500 transition-colors"
          placeholder="e.g., Summer in Tokyo" 
        />
      </div>

      {/* Dates & Location */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Dates *</label>
          <button type="button" onClick={() => setIsDatePickerOpen(true)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3.5 flex items-center gap-3 text-left hover:border-zinc-500 transition-colors">
            <Calendar size={18} className="text-orange-500 shrink-0" />
            <span className={clsx("truncate text-sm font-medium", formData.start_date ? "text-white" : "text-zinc-500")}>
              {formData.start_date ? `${format(parseISO(formData.start_date), 'MMM d')} - ${format(parseISO(formData.end_date), 'MMM d, yyyy')}` : 'Select dates...'}
            </span>
          </button>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Default City</label>
          <button type="button" onClick={() => setIsLocationPickerOpen(true)} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3.5 flex items-center gap-3 text-left hover:border-zinc-500 transition-colors">
            <MapPin size={18} className="text-orange-500 shrink-0" />
            <span className={clsx("truncate text-sm font-medium", formData.default_city_id ? "text-white" : "text-zinc-500")}>
              {formData.default_city_id ? cities.find(c => c.id === formData.default_city_id)?.name : 'Select city...'}
            </span>
          </button>
        </div>
      </div>

      {/* Currency */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Default Currency</label>
        <select 
          value={formData.currencies[0] || 'TWD'}
          onChange={e => setFormData({ ...formData, currencies: [e.target.value] })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-orange-500 transition-colors appearance-none"
        >
          {COMMON_CURRENCIES.map(curr => <option key={curr} value={curr}>{curr}</option>)}
        </select>
      </div>

      {/* Members */}
      <div>
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Users size={14}/> Trip Members</label>
        <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-2 max-h-[160px] overflow-y-auto custom-scrollbar">
          {availableUsers.map(u => {
            const isSelected = formData.members.includes(u.id);
            const isSelf = u.id === user?.id;
            return (
              <label key={u.id} className={clsx("flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors", isSelected ? "bg-orange-500/10" : "hover:bg-zinc-700/50", isSelf && "opacity-70 pointer-events-none")}>
                <div className="flex items-center gap-3">
                  {u.avatar_url ? <img src={u.avatar_url} alt={u.name} className="w-8 h-8 rounded-full object-cover border border-zinc-700" /> : <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white border border-zinc-600">{u.name.charAt(0).toUpperCase()}</div>}
                  <div><div className="text-sm font-bold text-white">{u.name} {isSelf && <span className="text-[10px] text-zinc-500 font-normal ml-1">(You)</span>}</div><div className="text-[10px] text-zinc-500">{u.role}</div></div>
                </div>
                <div className={clsx("w-5 h-5 rounded flex items-center justify-center border transition-colors", isSelected ? "bg-orange-500 border-orange-500 text-white" : "border-zinc-600")}>
                  {isSelected && <Check size={14} strokeWidth={3} />}
                </div>
                {/* 隱藏的 Checkbox */}
                <input type="checkbox" className="hidden" checked={isSelected} onChange={() => !isSelf && toggleMember(u.id)} disabled={isSelf} />
              </label>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-zinc-800">
        {extraButtons}
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl px-4 py-3.5 transition-colors">
            Cancel
          </button>
        )}
        <button type="submit" disabled={loading || uploading} className="flex-[2] bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-3.5 transition-colors shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
          {loading ? <Loader2 className="animate-spin" size={20} /> : submitText}
        </button>
      </div>

      {/* Pickers & Modals */}
      <LocationPicker isOpen={isLocationPickerOpen} onClose={() => setIsLocationPickerOpen(false)} onSelect={(id) => setFormData({ ...formData, default_city_id: id })} groupedCities={groupedCities} />
      
      {/* 🚨 這裡已經修正為傳入正確的 initialData 物件格式 🚨 */}
      <DateRangePicker 
        isOpen={isDatePickerOpen} 
        onClose={() => setIsDatePickerOpen(false)} 
        initialData={{ start_date: formData.start_date, end_date: formData.end_date }}
        onSelect={(start, end) => setFormData({ ...formData, start_date: start, end_date: end })} 
      />
      
      {croppingImage && <ImageCropper imageSrc={croppingImage} aspect={16 / 9} onCropComplete={handleCropComplete} onCancel={() => setCroppingImage(null)} />}
    </form>
  );
}