import React, { useState } from 'react';
import { TripBaseForm } from './TripBaseForm';
import { apiFetch } from '../utils/api';
import { Sparkles, Loader2, Trash2 } from 'lucide-react';
import { Trip } from '../types';

interface TripSettingsFormProps {
  trip: Trip;
  onUpdate: () => void;
  onDelete: () => void;
}

export function TripSettingsForm({ trip, onUpdate, onDelete }: TripSettingsFormProps) {
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. 處理基本設定更新 (名稱、日期、城市等)
  const handleSubmit = async (data: any) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      if (res.ok) {
        onUpdate();
        alert('Settings saved successfully!');
      } else {
        alert('Failed to update trip');
      }
    } catch (err: any) { 
      alert(err.message); 
    } finally { 
      setLoading(false); 
    }
  };

  // 2. 💡 找回並強化：處理 AI 同步計算
  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/sync`, {
        method: 'POST'
      });
      
      if (res.ok) {
        onUpdate(); // 同步完畢後重新抓取資料
        alert('AI Sync completed: Weather and place details updated!');
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
        submitText="Save Settings"
        loading={loading}
        // 💡 透過 extraButtons 注入自定義功能按鈕
        extraButtons={
          <div className="flex flex-1 gap-2">
            {/* AI 同步按鈕 */}
            <button
              type="button"
              disabled={isSyncing || loading}
              onClick={handleSync}
              className="flex-1 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-bold rounded-xl px-4 py-3.5 transition-all border border-orange-500/20 flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              {isSyncing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Sparkles size={18} className="group-hover:rotate-12 transition-transform" />
              )}
              <span className="whitespace-nowrap">AI Sync</span>
            </button>

            {/* 刪除按鈕 */}
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
                  onDelete();
                }
              }}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl px-4 py-3.5 transition-colors border border-red-500/20 flex items-center justify-center"
              title="Delete Trip"
            >
              <Trash2 size={18} />
            </button>
          </div>
        }
      />
      
      {/* 提示訊息 */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 flex gap-3 items-start">
        <div className="p-2 bg-orange-500/10 rounded-lg shrink-0">
          <Sparkles size={16} className="text-orange-500" />
        </div>
        <div className="text-xs text-zinc-400 leading-relaxed">
          <p className="font-bold text-zinc-200 mb-1">About AI Sync</p>
          Calculates dynamic weather for each location, synchronizes Google Places business hours, and optimizes your itinerary flow.
        </div>
      </div>
    </div>
  );
}