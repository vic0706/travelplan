import React, { useState } from 'react';
import { Loader2, Cpu, Wand2, Trash2, AlertTriangle, Check } from 'lucide-react';
import { TripBaseForm, TripFormData } from './TripBaseForm';
import { apiFetch } from '../../utils/api';
import { Trip } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';

interface TripSettingsFormProps {
  trip: Trip;
  onUpdate: () => void;
  onDelete: () => Promise<void>;
  onClose: () => void;
  // ✅ 新增：由 TripDetails 傳入的底部 toast 函式
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

export function TripSettingsForm({ trip, onUpdate, onDelete, onClose, showToast }: TripSettingsFormProps) {
  const [loading, setLoading] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // 用於日期衝突的 pending 資料
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);
  const [outOfBoundsDates, setOutOfBoundsDates] = useState<string[]>([]);

  const performSave = async (data: any, autoSave = false) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}`, { method: 'PUT', body: JSON.stringify(data) });
      if (res.ok && data.members) {
        await apiFetch(`/api/trips/${trip.id}/members`, { method: 'PUT', body: JSON.stringify({ user_ids: data.members }) });
      }

      if (res.ok) {
        // 更新本地 trip 物件（不觸發 navigate，保持在 settings 頁面）
        trip.title = data.title;
        trip.start_date = data.start_date;
        trip.end_date = data.end_date;
        trip.default_city_id = data.default_city_id;
        trip.cover_image_url = data.cover_image_url;
        (trip as any).currencies = JSON.stringify(data.currencies);
        (trip as any).members = data.members.map((id: number) => ({ user_id: id, role: 'Member' }));

        setPendingSaveData(null);

        // ✅ 改成底部 toast 而非 inline 文字
        showToast?.('Settings saved', 'success');
        setTimeout(() => onUpdate(), 300);
      } else {
        showToast?.('Save failed', 'error');
      }
    } catch (err: any) {
      showToast?.('Save failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSave = async (data: any) => {
    if (!data.title?.trim() || !data.start_date || !data.end_date) return;
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
      await performSave(data, true);
    } catch (err: any) {
      showToast?.('Save failed', 'error');
      setLoading(false);
    }
  };

  const handleCompute = async () => {
    setIsComputing(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/compute`, { method: 'POST' });
      if (res.ok) {
        onUpdate();
        showToast?.('Weather & places updated', 'success');
      } else {
        showToast?.('Compute failed', 'error');
      }
    } finally { setIsComputing(false); }
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/optimize`, { method: 'POST' });
      if (res.ok) {
        onUpdate();
        showToast?.('Itinerary optimized', 'success');
      } else {
        showToast?.('Optimize failed', 'error');
      }
    } finally { setIsOptimizing(false); }
  };

  return (
    <>
      <div className="flex flex-col h-full bg-zinc-950 rounded-3xl border border-zinc-800 overflow-hidden">

        {/* ✅ 標題列：移除 "Trip Settings" 文字，只留 AI 功能按鈕 */}
        <div className="px-5 py-4 flex items-center justify-end border-b border-zinc-800/50">
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="AI Computation: Update weather & places"
              disabled={isComputing || loading}
              onClick={handleCompute}
              className="flex flex-col items-center gap-1 px-4 py-2.5 text-orange-500 hover:bg-orange-500/10 rounded-2xl transition-all disabled:opacity-30 min-w-[64px]"
            >
              {isComputing
                ? <Loader2 size={24} className="animate-spin" />
                : <Cpu size={24} />
              }
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Compute</span>
            </button>

            <button
              type="button"
              title="AI Optimization: Re-sort itinerary flow"
              disabled={isOptimizing || loading}
              onClick={handleOptimize}
              className="flex flex-col items-center gap-1 px-4 py-2.5 text-orange-500 hover:bg-orange-500/10 rounded-2xl transition-all disabled:opacity-30 min-w-[64px]"
            >
              {isOptimizing
                ? <Loader2 size={24} className="animate-spin" />
                : <Wand2 size={24} />
              }
              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Optimize</span>
            </button>
          </div>
        </div>

        {/* 表單內容 */}
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <TripBaseForm
            initialData={trip}
            onSubmit={handleAutoSave}
            loading={loading}
            submitText="Save"
            onChange={handleAutoSave}
            hideSubmit={true}
            extraButtons={
              <div className="mt-6 pt-6 border-t border-zinc-800/50">
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="w-full bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-500 font-bold rounded-2xl py-4 transition-colors border border-red-500/20 flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} />
                  <span className="uppercase tracking-widest text-xs font-black">Delete Trip</span>
                </button>
              </div>
            }
          />
        </div>
      </div>

      {/* ✅ Delete Trip 確認彈窗 */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="刪除行程"
        message={`您確定要永久刪除「${trip.title}」嗎？\n所有相關的活動、記帳與預訂資料都將一併刪除，此操作無法復原。`}
        confirmText="永久刪除"
        cancelText="取消"
        type="danger"
        onConfirm={async () => {
          await onDelete();
          setIsDeleteConfirmOpen(false);
        }}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />

      {/* 日期超出範圍警告彈窗 */}
      <AnimatePresence>
        {pendingSaveData && (
          <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#1c1c1e] border border-red-500/30 rounded-[32px] w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[100px] bg-red-500/20 blur-[50px] rounded-full pointer-events-none" />
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-5 border border-red-500/20 relative z-10">
                <AlertTriangle size={32} className="text-red-500" />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest mb-3 relative z-10">Date Conflict</h3>
              <p className="text-sm text-zinc-400 mb-4 leading-relaxed relative z-10">
                Activities outside range: <br />
                <span className="font-mono font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-lg block mt-3 inline-block">
                  {outOfBoundsDates.join(', ')}
                </span>
              </p>
              <div className="flex w-full gap-3 relative z-10">
                <button
                  onClick={() => setPendingSaveData(null)}
                  className="flex-1 py-4 bg-zinc-800 text-white font-bold rounded-2xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => performSave(pendingSaveData, true)}
                  disabled={loading}
                  className="flex-[1.5] py-4 bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-widest text-[12px] rounded-2xl transition-colors shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                >
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