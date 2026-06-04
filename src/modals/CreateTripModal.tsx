import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { TripBaseForm, TripFormData } from '../components/forms/TripBaseForm';

interface CreateTripModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSuccess: (tripId: number) => void;
}

export function CreateTripModal({ isOpen = true, onClose, onSuccess }: CreateTripModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (data: TripFormData) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/trips', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          start_date: data.start_date,
          end_date: data.end_date,
          default_city_id: data.default_city_id,
          cover_image_url: data.cover_image_url,
          currencies: data.currencies
        })
      });
      if (!res.ok) throw new Error('Failed to create trip');
      const trip = await res.json() as { id: number };

      if (data.members.length > 0) {
        await apiFetch(`/api/trips/${trip.id}/members`, {
          method: 'PUT',
          body: JSON.stringify({ user_ids: data.members })
        });
      }

      onSuccess(trip.id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        {/* 1. 獨立的背景遮罩 (點擊背景也能關閉) */}
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }} 
          className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer" 
        />
        
        {/* 2. 彈窗主體 (設定 relative z-10 確保在遮罩之上) */}
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 20 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative z-10 bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()} // 防止點擊彈窗內部時觸發到背景的關閉
        >
          <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 shrink-0">
            <h2 className="text-xl font-bold text-white">Create New Trip</h2>
            {/* 3. 強化版 X 關閉按鈕 */}
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }} 
              className="text-zinc-400 hover:text-white transition-colors p-1.5 hover:bg-zinc-800 rounded-full cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto custom-scrollbar">
            <TripBaseForm 
              onSubmit={handleSubmit}
              onCancel={onClose}
              submitText="Create Trip"
              loading={loading}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// 保留 default export 確保 Home.tsx 若使用 import CreateTripModal 也能正常運作
export default CreateTripModal;