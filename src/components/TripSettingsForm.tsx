import React, { useState } from 'react';
import { TripBaseForm } from './TripBaseForm';
import { apiFetch } from '../utils/api';
import { Loader2, Trash2, AlertTriangle, Cpu, Wand2 } from 'lucide-react';
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
  const [isComputing, setIsComputing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);
  const [outOfBoundsDates, setOutOfBoundsDates] = useState<string[]>([]);

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

  const handleCompute = async () => {
    setIsComputing(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/compute`, { method: 'POST' });
      if (res.ok) { onUpdate(); }
    } finally { setIsComputing(false); }
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/optimize`, { method: 'POST' });
      if (res.ok) { onUpdate(); }
    } finally { setIsOptimizing(false); }
  };

  return (
    <>
      <style>{`
        #trip-settings-style-override form > div.pt-6.border-t > div:first-child {
          display: none !important;
        }
      `}</style>

      <div id="trip-settings-style-override" className="flex flex-col h-full bg-[#1c1c1e]">
        
        {/* 極簡標題列：標題 + 橘色圖示按鈕 */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-zinc-800/50">
          <h2 className="text-lg font-black text-white uppercase tracking-[0.2em]">Trip Settings</h2>
          
          <div className="flex items-center gap-4">
            {/* AI Compute 按鈕 */}
            <button 
              type="button" 
              title="AI Computation: Update weather & places"
              disabled={isComputing || loading} 
              onClick={handleCompute} 
              className="relative p-2 text-orange-500 hover:bg-orange-500/10 rounded-xl transition-all disabled:opacity-30"
            >
              {isComputing ? <Loader2 size={22} className="animate-spin" /> : <Cpu size={22} />}
            </button>
            
            {/* AI Optimize 按鈕 */}
            <button 
              type="button" 
              title="AI Optimization: Re-sort itinerary flow"
              disabled={isOptimizing || loading} 
              onClick={handleOptimize} 
              className="relative p-2 text-orange-500 hover:bg-orange-500/10 rounded-xl transition-all disabled:opacity-30"
            >
              {isOptimizing ? <Loader2 size={22} className="animate-spin" /> : <Wand2 size={22} />}
            </button>
          </div>
        </div>

        {/* 表單內容 */}
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <TripBaseForm
            initialData={trip}
            onSubmit={handleSubmit}
            loading={loading}
            submitText="Save" 
            extraButtons={
              <div className="grid grid-cols-2 gap-3 mt-10 pt-8 border-t border-zinc-800/50">
                <button 
                  type="button" 
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete this trip?')) onDelete();
                  }} 
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-2xl py-4 transition-colors border border-red-500/20 flex items-center justify-center gap-2" 
                >
                  <Trash2 size={18} />
                  <span className="uppercase tracking-widest text-xs font-black">Delete Trip</span>
                </button>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-black rounded-2xl py-4 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                  <span className="uppercase tracking-widest text-xs">Save Settings</span>
                </button>
              </div>
            }
          />
        </div>
      </div>

      {/* 警告彈窗 */}
      <AnimatePresence>
        {pendingSaveData && (
          <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#1c1c1e] border border-red-500/30 rounded-[32px] w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[100px] bg-red-500/20 blur-[50px] rounded-full pointer-events-none" />
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-5 border border-red-500/20 relative z-10"><AlertTriangle size={32} className="text-red-500" /></div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest mb-3 relative z-10">Date Conflict</h3>
              <p className="text-sm text-zinc-400 mb-4 leading-relaxed relative z-10">Activities outside range: <br /> <span className="font-mono font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-lg block mt-3 inline-block">{outOfBoundsDates.join(', ')}</span></p>
              <div className="flex w-full gap-3 relative z-10">
                <button onClick={() => setPendingSaveData(null)} className="flex-1 py-4 bg-zinc-800 text-white font-bold rounded-2xl transition-colors">Cancel</button>
                <button onClick={() => performSave(pendingSaveData)} disabled={loading} className="flex-[1.5] py-4 bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-widest text-[12px] rounded-2xl transition-colors shadow-lg shadow-red-500/20 flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Proceed Anyway'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}