import React, { useState } from 'react';
import { TripBaseForm } from './TripBaseForm';
import { apiFetch } from '../utils/api';
import { Sparkles, Loader2, Trash2, AlertTriangle, Cpu, Wand2 } from 'lucide-react';
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
  
  // 💡 拆分 AI 狀態
  const [isComputing, setIsComputing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);
  const [outOfBoundsDates, setOutOfBoundsDates] = useState<string[]>([]);

  // 1. 攔截儲存動作：檢查日期衝突
  const handleSubmit = async (data: any) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/itineraries`);
      if (res.ok) {
        const itineraries = await res.json();
        const existingDates = [...new Set(itineraries.map((i: any) => i.date))] as string[];
        const newStart = data.start_date;
        const newEnd = data.end_date;
        const outOfBounds = existingDates.filter(date => date < newStart || date > newEnd);

        if (outOfBounds.length > 0) {
          setOutOfBoundsDates(outOfBounds.sort());
          setPendingSaveData(data);
          setLoading(false);
          return;
        }
      }
      await performSave(data);
    } catch (err: any) {
      alert("Verification failed: " + err.message);
      setLoading(false);
    }
  };

  // 2. 執行儲存
  const performSave = async (data: any) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}`, { method: 'PUT', body: JSON.stringify(data) });
      if (res.ok && data.members) {
        await apiFetch(`/api/trips/${trip.id}/members`, { method: 'PUT', body: JSON.stringify({ user_ids: data.members }) });
      }

      if (res.ok) {
        trip.title = data.title;
        trip.start_date = data.start_date;
        trip.end_date = data.end_date;
        trip.default_city_id = data.default_city_id;
        trip.cover_image_url = data.cover_image_url;
        trip.currencies = JSON.stringify(data.currencies);
        trip.members = data.members.map((id: number) => ({ user_id: id, role: 'Member' }));

        setPendingSaveData(null);
        onClose();
        setTimeout(() => onUpdate(), 1500);
      } else {
        alert('Update failed');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 💡 3. AI Computation (天氣、Google API)
  const handleCompute = async () => {
    setIsComputing(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/compute`, { method: 'POST' });
      if (res.ok) {
        onUpdate();
        alert('Computation completed!');
      }
    } finally {
      setIsComputing(false);
    }
  };

  // 💡 4. AI Itinerary Optimization (排序)
  const handleOptimize = async () => {
    setIsOptimizing(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/optimize`, { method: 'POST' });
      if (res.ok) {
        onUpdate();
        alert('Itinerary optimized!');
      }
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <TripBaseForm
          initialData={trip}
          onSubmit={handleSubmit}
          onCancel={onClose}
          loading={loading}
          hideDefaultButtons={true} // 💡 假設你的 BaseForm 支援隱藏預設按鈕，我們在下面自定義介面
          extraButtons={
            <div className="flex flex-col gap-3 w-full mt-4">
              
              {/* 第一行：AI 功能 */}
              <div className="grid grid-cols-2 gap-3">
                <button 
                  type="button" 
                  disabled={isComputing || loading} 
                  onClick={handleCompute} 
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-2xl py-4 transition-all border border-zinc-700 flex flex-col items-center justify-center gap-1 disabled:opacity-50" 
                >
                  {isComputing ? <Loader2 size={18} className="animate-spin" /> : <Cpu size={18} />}
                  <span className="uppercase tracking-widest text-[9px] font-black">AI Computation</span>
                </button>
                
                <button 
                  type="button" 
                  disabled={isOptimizing || loading} 
                  onClick={handleOptimize} 
                  className="bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-bold rounded-2xl py-4 transition-all border border-orange-500/20 flex flex-col items-center justify-center gap-1 disabled:opacity-50" 
                >
                  {isOptimizing ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
                  <span className="uppercase tracking-widest text-[9px] font-black">AI Optimization</span>
                </button>
              </div>

              {/* 第二行：Delete 與 Save Settings */}
              <div className="grid grid-cols-2 gap-3">
                <button 
                  type="button" 
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete this trip?')) onDelete();
                  }} 
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-2xl py-4 transition-colors border border-red-500/20 flex items-center justify-center gap-2" 
                >
                  <Trash2 size={16} />
                  <span className="uppercase tracking-widest text-xs font-black">Delete</span>
                </button>

                {/* 💡 這裡是原本的 Submit 按鈕 */}
                <button 
                  type="submit" // 💡 這裡設為 submit 會觸發 TripBaseForm 的 onSubmit
                  disabled={loading}
                  className="bg-white hover:bg-zinc-200 text-black font-black rounded-2xl py-4 transition-all flex items-center justify-center gap-2 shadow-lg shadow-white/5"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                  <span className="uppercase tracking-widest text-xs">Save Settings</span>
                </button>
              </div>

              {/* 第三行：Cancel */}
              <button 
                type="button" 
                onClick={onClose} 
                className="w-full py-4 text-zinc-500 hover:text-white font-bold text-xs uppercase tracking-[0.3em] transition-colors"
              >
                Cancel
              </button>

            </div>
          }
        />

        {/* 說明文字區塊 */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 flex gap-3 items-start mt-2">
          <div className="p-2 bg-orange-500/10 rounded-lg shrink-0">
            <Sparkles size={16} className="text-orange-500" />
          </div>
          <div className="text-[10px] text-zinc-400 leading-relaxed">
            <p className="font-bold text-zinc-200 mb-1">AI Tools Guide</p>
            <span className="text-zinc-300">Computation:</span> Update weather and business hours (API call). <br/>
            <span className="text-zinc-300">Optimization:</span> Resort itinerary based on your preferences.
          </div>
        </div>
      </div>

      {/* 日期衝突警告彈窗 (保持原樣) */}
      <AnimatePresence>
        {pendingSaveData && (
          <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#1c1c1e] border border-red-500/30 rounded-[32px] w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[100px] bg-red-500/20 blur-[50px] rounded-full pointer-events-none" />
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-5 border border-red-500/20 relative z-10"><AlertTriangle size={32} className="text-red-500" /></div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest mb-3 relative z-10">Date Conflict</h3>
              <p className="text-sm text-zinc-400 mb-4 leading-relaxed relative z-10">You have existing activities scheduled on: <br /> <span className="font-mono font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-lg block mt-3 inline-block">{outOfBoundsDates.join(', ')}</span></p>
              <p className="text-[11px] text-zinc-500 mb-6 bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50 relative z-10">Continuing will hide these from your timeline. They will not be deleted.</p>
              <div className="flex w-full gap-3 relative z-10">
                <button onClick={() => setPendingSaveData(null)} className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-2xl">Cancel</button>
                <button onClick={() => performSave(pendingSaveData)} disabled={loading} className="flex-[1.5] py-4 bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-widest text-[12px] rounded-2xl shadow-lg shadow-red-500/20 flex items-center justify-center gap-2">
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