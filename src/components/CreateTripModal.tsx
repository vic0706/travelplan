import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from '../utils/api';
import { TripBaseForm, TripFormData } from './TripBaseForm';

interface CreateTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tripId: number) => void;
}

export function CreateTripModal({ isOpen, onClose, onSuccess }: CreateTripModalProps) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (data: TripFormData) => {
    setLoading(true);
    try {
      // 1. 建立 Trip
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

      // 2. 更新成員名單
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 shrink-0">
          <h2 className="text-xl font-bold text-white">Create New Trip</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1 hover:bg-zinc-800 rounded-full"><X size={20} /></button>
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
  );
}