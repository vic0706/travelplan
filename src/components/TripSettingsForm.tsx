import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { Trash2 } from 'lucide-react';
import { apiFetch } from '../utils/api';
import { Trip } from '../types';
import { ConfirmDialog } from './ConfirmDialog';
import { TripBaseForm, TripFormData } from './TripBaseForm';

interface TripSettingsFormProps {
  trip: Trip;
  onSuccess: () => void;
}

export function TripSettingsForm({ trip, onSuccess }: TripSettingsFormProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // 將原本 trip.members 的結構轉換為單純的 userId 陣列
  const initialMembers = Array.isArray(trip.members) 
    ? trip.members.map((m: any) => m.user_id) 
    : [];

  const handleSubmit = async (data: TripFormData) => {
    setLoading(true);
    try {
      // 1. 更新 Trip 內容
      const res = await apiFetch(`/api/trips/${trip.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: data.title,
          start_date: data.start_date,
          end_date: data.end_date,
          default_city_id: data.default_city_id,
          cover_image_url: data.cover_image_url,
          currencies: data.currencies
        })
      });
      if (!res.ok) throw new Error('Failed to update settings');

      // 2. 更新 Trip 成員
      await apiFetch(`/api/trips/${trip.id}/members`, {
        method: 'PUT',
        body: JSON.stringify({ user_ids: data.members })
      });

      onSuccess();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTrip = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete trip');
      
      await db.trips.delete(trip.id);
      await db.itineraries.where('trip_id').equals(trip.id).delete();
      await db.expenses.where('trip_id').equals(trip.id).delete();
      await db.tripMembers.where('trip_id').equals(trip.id).delete();
      await db.bookings.where('trip_id').equals(trip.id).delete();
      
      setIsDeleteDialogOpen(false);
      navigate('/', { replace: true });
    } catch (err: any) {
      alert('Failed to delete trip: ' + err.message);
      setLoading(false);
    }
  };

  return (
    <>
      <TripBaseForm 
        initialData={{
          title: trip.title,
          start_date: trip.start_date,
          end_date: trip.end_date,
          default_city_id: trip.default_city_id,
          cover_image_url: trip.cover_image_url,
          currencies: trip.currencies,
          members: initialMembers
        }}
        onSubmit={handleSubmit}
        submitText="Save Settings"
        loading={loading}
        extraButtons={
          <button 
            type="button" 
            onClick={() => setIsDeleteDialogOpen(true)}
            className="px-4 py-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl transition-all"
            title="Delete Trip"
          >
            <Trash2 size={20} />
          </button>
        }
      />

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Delete Trip"
        message="Are you sure you want to delete this entire trip? This action cannot be undone and all data associated with this trip will be permanently removed."
        confirmText={loading ? "Deleting..." : "Delete Trip"}
        cancelText="Keep Trip"
        onConfirm={handleDeleteTrip}
        onCancel={() => setIsDeleteDialogOpen(false)}
      />
    </>
  );
}