import React, { useState } from 'react';
import { TripBaseForm } from './TripBaseForm';
import { apiFetch } from '../utils/api';
import { Sparkles, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  
  // 💡 用來控制警告彈窗的狀態
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);
  const [outOfBoundsDates, setOutOfBoundsDates] = useState<string[]>([]);

  // 1. 攔截儲存動作：先檢查日期衝突
  const handleSubmit = async (data: any) => {
    setLoading(true);
    try {
      // 取得目前這趟旅程「所有的現有活動」
      const res = await apiFetch(`/api/trips/${trip.id}/itineraries`);
      if (res.ok) {
        const itineraries = await res.json();
        
        // 抓出所有有排活動的不重複日期
        const existingDates = [...new Set(itineraries.map((i: any) => i.date))] as string[];
        
        // 檢查是否有活動的日期「小於新開始日」或「大於新結束日」
        const newStart = data.start_date;
        const newEnd = data.end_date;
        const outOfBounds = existingDates.filter(date => date < newStart || date > newEnd);

        // 如果有衝突，暫停儲存並彈出警告！
        if (outOfBounds.length > 0) {
          setOutOfBoundsDates(outOfBounds.sort());
          setPendingSaveData(data); // 暫存使用者剛剛輸入的新設定
          setLoading(false);
          return; // 終止流程
        }
      }
      
      // 如果沒衝突，直接執行真實儲存
      await performSave(data);
    } catch (err: any) {
      alert("Failed to verify itineraries: " + err.message);
      setLoading(false);
    }
  };

  // 2. 真實儲存邏輯 (包含樂觀更新)
  const performSave = async (data: any) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}`, { method: 'PUT', body: JSON.stringify(data) });
      
      if (res.ok && data.members) {
        await apiFetch(`/api/trips/${trip.id}/members`, { method: 'PUT', body: JSON.stringify({ user_ids: data.members }) });
      }

      if (res.ok) {
        // 樂觀更新 (Optimistic Update)，確保畫面立即生效
        trip.title = data.title;
        trip.start_date = data.start_date;
        trip.end_date = data.end_date;
        trip.default_city_id = data.default_city_id;
        trip.cover_image_url = data.cover_image_url;
        trip.currencies = JSON.stringify(data.currencies);
        trip.members = data.members.map((id: number) => ({ user_id: id, role: 'Member' }));

        setPendingSaveData(null); // 關閉警告彈窗 (如果有開的話)
        onClose();                // 關閉設定彈窗
        
        setTimeout(() => {
          onUpdate(); // 1.5 秒後背景重新抓取，確保 D1 同步完成
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
    <>
      <div className="space-y-6">
        <TripBaseForm
          initialData={trip}
          onSubmit={handleSubmit} // 綁定攔截器
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

      {/* 💡 自製日期衝突警告彈窗 (只有發生衝突時才會跳出) */}
      <AnimatePresence>
        {pendingSaveData && (
          <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1c1c1e] border border-red-500/30 rounded-[32px] w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden"
            >
              {/* 背景紅光特效 */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[100px] bg-red-500/20 blur-[50px] rounded-full pointer-events-none" />

              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-5 border border-red-500/20 relative z-10">
                <AlertTriangle size={32} className="text-red-500" />
              </div>
              
              <h3 className="text-lg font-black text-white uppercase tracking-widest mb-3 relative z-10">Date Conflict</h3>
              
              <p className="text-sm text-zinc-400 mb-4 leading-relaxed relative z-10">
                You have existing activities scheduled on dates outside your new trip range:
                <br />
                <span className="font-mono font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-lg block mt-3 inline-block">
                  {outOfBoundsDates.join(', ')}
                </span>
              </p>
              
              <p className="text-[11px] text-zinc-500 mb-6 bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50 relative z-10">
                Continuing will hide these activities from your timeline. They will not be deleted, but you won't be able to see them.
              </p>

              <div className="flex w-full gap-3 relative z-10">
                <button 
                  onClick={() => setPendingSaveData(null)}
                  className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => performSave(pendingSaveData)}
                  disabled={loading}
                  className="flex-[1.5] py-4 bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-widest text-[12px] rounded-2xl transition-colors shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : 'Proceed Anyway'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}