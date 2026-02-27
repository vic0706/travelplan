import React, { useState, useEffect } from 'react';
import { useAppStore, User } from '../store';
import { X, Calendar, Upload, Loader2, User as UserIcon, Check } from 'lucide-react';
import { DateRangePicker } from './DateRangePicker';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { ImageCropper, uploadImageToSupabase } from './ImageCropper';
import { useNavigate } from 'react-router-dom';
import { LocationPicker } from './LocationPicker';

export function CreateTripModal() {
  const navigate = useNavigate();
  const { isCreateTripModalOpen, setCreateTripModalOpen, cities } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    start_date: '',
    end_date: '',
    cover_image_url: '',
    is_public: 0,
    default_city_id: ''
  });

  // Group cities by country
  const groupedCities = cities.reduce((acc, city) => {
    if (!acc[city.country]) acc[city.country] = [];
    acc[city.country].push(city);
    return acc;
  }, {} as Record<string, typeof cities>);

  useEffect(() => {
    if (isCreateTripModalOpen) {
      const fetchUsers = async () => {
        try {
          const res = await apiFetch('/api/users');
          if (res.ok) {
            const data = await res.json() as User[];
            setUsers(data);
          }
        } catch (err) {
          console.error('Failed to fetch users', err);
        }
      };
      fetchUsers();
    }
  }, [isCreateTripModalOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      setCroppingImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCroppingImage(null);
    setUploading(true);
    setError('');
    try {
      const publicUrl = await uploadImageToSupabase(croppedBlob);
      setFormData(prev => ({ ...prev, cover_image_url: publicUrl }));
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError('Failed to upload image: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleMember = (userId: number) => {
    setSelectedMembers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // 1. Create Trip
      const res = await apiFetch('/api/trips', {
        method: 'POST',
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error || 'Failed to create trip');
      }

      const trip = await res.json() as { id: number };

      // 2. Add Members
      if (selectedMembers.length > 0) {
        await apiFetch(`/api/trips/${trip.id}/members`, {
          method: 'POST',
          body: JSON.stringify({ userIds: selectedMembers })
        });
      }

      setCreateTripModalOpen(false);
      navigate(`/trip/${trip.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isCreateTripModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setCreateTripModalOpen(false)}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 sticky top-0 z-10 backdrop-blur-md">
            <h2 className="text-xl font-bold text-white">New Trip</h2>
            <button
              onClick={() => setCreateTripModalOpen(false)}
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Trip Title</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., Summer in Tokyo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Primary City</label>
              <div 
                onClick={() => setIsLocationPickerOpen(true)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white cursor-pointer hover:border-orange-500 transition-colors flex items-center justify-between"
              >
                <span className={formData.default_city_id ? 'text-white' : 'text-zinc-500'}>
                  {formData.default_city_id 
                    ? cities.find(c => String(c.id) === String(formData.default_city_id))?.name 
                    : 'Select a city'}
                </span>
                <Check size={16} className={formData.default_city_id ? 'text-orange-500' : 'text-transparent'} />
              </div>
            </div>

            <LocationPicker
              isOpen={isLocationPickerOpen}
              onClose={() => setIsLocationPickerOpen(false)}
              onSelect={(cityId) => setFormData({ ...formData, default_city_id: String(cityId) })}
              groupedCities={groupedCities}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Start Date</label>
              <DateRangePicker
                label="Start Date"
                value={{ start: formData.start_date ? new Date(formData.start_date) : null, end: null }}
                onChange={range => setFormData({ ...formData, start_date: range.start?.toISOString().split('T')[0] || '' })}
              />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">End Date</label>
              <DateRangePicker
                label="End Date"
                value={{ start: formData.end_date ? new Date(formData.end_date) : null, end: null }}
                onChange={range => setFormData({ ...formData, end_date: range.start?.toISOString().split('T')[0] || '' })}
              />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Visibility</label>
              <div className="flex items-center gap-3 bg-zinc-800 border border-zinc-700 rounded-xl p-3">
                <div 
                  className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${formData.is_public ? 'bg-orange-500' : 'bg-zinc-600'}`} 
                  onClick={() => setFormData({ ...formData, is_public: formData.is_public ? 0 : 1 })}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${formData.is_public ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-white font-medium">{formData.is_public ? 'Public' : 'Private'}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Members</label>
              <div className="grid grid-cols-4 gap-2">
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMember(u.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                      selectedMembers.includes(u.id)
                        ? 'bg-orange-500/20 border-orange-500'
                        : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    <div className="relative w-10 h-10">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-500">
                            <UserIcon size={16} />
                          </div>
                        )}
                      </div>
                      {selectedMembers.includes(u.id) && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border border-black">
                          <Check size={10} className="text-white" />
                        </div>
                      )}
                    </div>
                    <span className={`text-[10px] font-medium truncate w-full text-center ${selectedMembers.includes(u.id) ? 'text-white' : 'text-zinc-400'}`}>
                      {u.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Cover Image</label>
              <div className="space-y-3">
                {formData.cover_image_url && (
                  <div className="relative h-32 w-full rounded-xl overflow-hidden border border-zinc-700">
                    <img 
                      src={formData.cover_image_url} 
                      alt="Cover Preview" 
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, cover_image_url: '' })}
                      className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="cover-upload"
                    disabled={uploading}
                  />
                  <label
                    htmlFor="cover-upload"
                    className={`flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-800/50 transition-all cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {uploading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={18} />
                        <span>Upload Image</span>
                      </>
                    )}
                  </label>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Supported formats: JPG, PNG, WEBP. Max size: 5MB.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || uploading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl px-4 py-3 transition-all shadow-lg shadow-orange-500/20 active:scale-95 mt-2"
            >
              {loading ? 'Creating...' : 'Create Trip'}
            </button>
          </form>
          {croppingImage && (
            <ImageCropper
              imageSrc={croppingImage}
              aspect={16 / 9}
              onCropComplete={handleCropComplete}
              onCancel={() => setCroppingImage(null)}
            />
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
