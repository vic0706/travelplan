import React, { useState } from 'react';
import { TripBaseForm } from './TripBaseForm';
import { apiFetch } from '../utils/api';
import { Sparkles, Loader2, Trash2 } from 'lucide-react';
import { Trip } from '../types';

interface TripSettingsFormProps {
  trip: Trip;
  onUpdate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function TripSettingsForm({ trip, onUpdate, onDelete, onClose }: TripSettingsFormProps) {
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSubmit = async (data: any) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}`, { method: 'PUT', body: JSON.stringify(data) });
      
      if (res.ok && data.members) {
        await apiFetch(`/api/trips/${trip.id}/members`, { method: 'PUT', body: JSON.stringify({ user_ids: data.members }) });
      }

      if (res.ok) {
        // 💡 核心修復：樂觀更新 (Optimistic Update)
        // 直接強制修改父層傳進來的 trip 記憶體物件！
        // 這樣就算切換分頁，畫面也會立刻使用這裡的最新資料，完全無視 D1 延遲。
        trip.title = data.title;
        trip.start_date = data.start_date;
        trip.end_date = data.end_date;
        trip.default_city_id = data.default_city_id;
        trip.cover_image_url = data.cover_image_url;
        trip.currencies = JSON.stringify(data.currencies);
        trip.members = data.members.map((id: number) => ({ user_id: id, role: 'Member' }));

        onClose(); // 瞬間關閉視窗，體驗滑順

        // 💡 延遲 1.5 秒再讓父層去背景重抓，確保 D1 全球節點已經同步完畢
        setTimeout(() => {
          onUpdate();
        }, 1500);

      } else {
        alert('Failed to update trip');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/sync`, { method: 'POST' });
      if (res.ok) {
        onClose();
        setTimeout(() => {
          onUpdate();
        }, 1500);
      } else {
        const error = await res.json() as { error?: string };
        alert(`Sync failed: ${error.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <TripBaseForm
        initialData={trip}
        onSubmit={handleSubmit}
        onCancel={onClose}
        submitText="Save Settings"
        loading={loading}
        extraButtons={
          <div className="grid grid-cols-2 gap-3 w-full">
            <button 
              type="button" 
              disabled={isSyncing || loading} 
              onClick={handleSync} 
              className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-bold rounded-xl py-3.5 transition-all border border-indigo-500/20 flex items-center justify-center gap-2 group disabled:opacity-50" 
            >
              {isSyncing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Sparkles size={18} className="group-hover:rotate-12 transition-transform" />
              )}
              <span className="uppercase tracking-widest text-xs font-black">RUN AI</span>
            </button>
            
            <button 
              type="button" 
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
                  onDelete();
                }
              }} 
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl py-3.5 transition-colors border border-red-500/20 flex items-center justify-center gap-2" 
              title="Delete Trip" 
            >
              <Trash2 size={18} />
              <span className="uppercase tracking-widest text-xs font-black">Delete</span>
            </button>
          </div>
        }
      />

      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 flex gap-3 items-start mt-2">
        <div className="p-2 bg-orange-500/10 rounded-lg shrink-0">
          <Sparkles size={16} className="text-orange-500" />
        </div>
        <div className="text-xs text-zinc-400 leading-relaxed">
          <p className="font-bold text-zinc-200 mb-1">About RUN AI</p>
          Calculates dynamic weather for each location, synchronizes Google Places business hours, and optimizes your itinerary flow.
        </div>
      </div>
    </div>
  );
}