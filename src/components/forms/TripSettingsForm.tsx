import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, CloudSun, MapPin, Wand2, Sparkles, Trash2, AlertTriangle, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { TripBaseForm, TripFormData } from './TripBaseForm';
import { apiFetch } from '../../utils/api';
import { Trip } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import { clsx } from 'clsx';

interface TripSettingsFormProps {
  trip: Trip;
  onUpdate: () => void;
  onDelete: () => Promise<void>;
  onClose: () => void;
  showToast?: (message: string, type?: 'success' | 'error') => void;
}

interface QuotaState {
  weather: { count: number; limit: number | null };
  places: { count: number; limit: number | null };
  optimize: { count: number; limit: number | null };
  isAdmin: boolean;
}

interface MemberWithQuota {
  id: number;
  name: string;
  avatar_url?: string;
  trip_role: string;
  quota?: Record<string, { count: number; limit: number }>;
}

export function TripSettingsForm({ trip, onUpdate, onDelete, onClose, showToast }: TripSettingsFormProps) {
  const { user } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [isWeatherUpdating, setIsWeatherUpdating] = useState(false);
  const [isPlacesUpdating, setIsPlacesUpdating] = useState(false);
  const [optimizingMode, setOptimizingMode] = useState<'rule' | 'ai' | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [quota, setQuota] = useState<QuotaState | null>(null);

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminMembers, setAdminMembers] = useState<MemberWithQuota[]>([]);
  const [adminMembersLoading, setAdminMembersLoading] = useState(false);

  // Used for date conflict warning
  const [pendingSaveData, setPendingSaveData] = useState<any>(null);
  const [outOfBoundsDates, setOutOfBoundsDates] = useState<string[]>([]);

  const isMember = !!(user && (
    trip.members?.some(m => Number((m as any).user_id ?? m.id) === Number(user.id)) ||
    user.role === 'Admin'
  ));

  const fetchQuota = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/quota-status`);
      if (res.ok) setQuota(await res.json());
    } catch {}
  }, [trip.id]);

  useEffect(() => { fetchQuota(); }, [fetchQuota]);

  const loadAdminMembers = useCallback(async () => {
    setAdminMembersLoading(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/members`);
      if (!res.ok) return;
      const members: any[] = await res.json();
      const withQuota = await Promise.all(
        members.map(async (m) => {
          const qRes = await apiFetch(`/api/admin/user-quota/${m.id}`);
          const q = qRes.ok ? await qRes.json() : undefined;
          return { id: m.id, name: m.name || `#${m.id}`, avatar_url: m.avatar_url, trip_role: m.trip_role, quota: q };
        })
      );
      setAdminMembers(withQuota);
    } finally {
      setAdminMembersLoading(false);
    }
  }, [trip.id]);

  useEffect(() => {
    if (showAdminPanel && user?.role === 'Admin') loadAdminMembers();
  }, [showAdminPanel, loadAdminMembers, user?.role]);

  const handleResetMemberQuota = async (memberId: number) => {
    try {
      const res = await apiFetch('/api/admin/user-quota/reset', {
        method: 'POST',
        body: JSON.stringify({ userId: memberId }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        setAdminMembers(prev => prev.map(m => m.id === memberId ? { ...m, quota: data.quota } : m));
        showToast?.('已重設使用次數', 'success');
      }
    } catch {}
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
        (trip as any).currencies = JSON.stringify(data.currencies);
        (trip as any).members = data.members.map((id: number) => ({ user_id: id, role: 'Member' }));
        setPendingSaveData(null);
        showToast?.('設定已儲存', 'success');
        setTimeout(() => onUpdate(), 300);
      } else {
        showToast?.('儲存失敗', 'error');
      }
    } catch {
      showToast?.('儲存失敗', 'error');
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
        const outOfBounds = existingDates.filter(date => date < data.start_date || date > data.end_date);
        if (outOfBounds.length > 0) {
          setOutOfBoundsDates(outOfBounds.sort());
          setPendingSaveData(data);
          setLoading(false);
          return;
        }
      }
      await performSave(data);
    } catch {
      showToast?.('儲存失敗', 'error');
      setLoading(false);
    }
  };

  const handleUpdateWeather = async () => {
    setIsWeatherUpdating(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/update-weather`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.cached) {
          showToast?.(data.message || '1小時內已是最新，無需重新更新', 'success');
        } else {
          onUpdate();
          showToast?.('天氣資料已更新', 'success');
          fetchQuota();
        }
      } else {
        const data = await res.json() as any;
        if (res.status === 429) {
          showToast?.('今日已達使用上限（10次）', 'error');
        } else {
          showToast?.('更新天氣失敗', 'error');
        }
      }
    } finally { setIsWeatherUpdating(false); }
  };

  const handleUpdatePlaces = async () => {
    setIsPlacesUpdating(true);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/update-places`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.cached) {
          showToast?.(data.message || '1小時內已是最新，無需重新更新', 'success');
        } else {
          onUpdate();
          showToast?.('景點資訊已更新', 'success');
          fetchQuota();
        }
      } else {
        if (res.status === 429) {
          showToast?.('今日已達使用上限（10次）', 'error');
        } else {
          showToast?.('更新景點失敗', 'error');
        }
      }
    } finally { setIsPlacesUpdating(false); }
  };

  const handleOptimize = async (mode: 'rule' | 'ai') => {
    setOptimizingMode(mode);
    try {
      const res = await apiFetch(`/api/trips/${trip.id}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        onUpdate();
        fetchQuota();
        if (data.geminiErrors?.length > 0) console.warn('[Gemini fallback]', data.geminiErrors);
        const aiTag = data.geminiDaysUsed > 0
          ? ` (Gemini AI ✓ ${data.geminiDaysUsed} 天)`
          : '';
        if (data.unplacedCount > 0) {
          showToast?.(`排序失敗：有 ${data.unplacedCount} 個行程無法排入時間內`, 'error');
        } else if (data.conflictCount > 0) {
          showToast?.(`排序完成${aiTag}，但有 ${data.conflictCount} 個行程時間重疊`, 'error');
        } else if (data.missingTransportDates?.length > 0) {
          const dateLabel = data.missingTransportDates.map((d: string) => {
            const parts = d.split('-');
            return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
          }).join('、');
          showToast?.(`排序完成${aiTag}，但 ${dateLabel} 有行程未設定交通方式`, 'error');
        } else {
          showToast?.(`行程排序完成${aiTag}`, 'success');
        }
      } else {
        if (res.status === 429) {
          showToast?.('今日已達使用上限（10次）', 'error');
        } else {
          showToast?.('景點排序失敗', 'error');
        }
      }
    } finally { setOptimizingMode(null); }
  };

  const getQuotaLabel = (action: 'weather' | 'places' | 'optimize') => {
    if (!quota) return null;
    if (quota.isAdmin) return null;
    const q = quota[action];
    if (!q || q.limit == null) return null;
    const used = q.count;
    const limit = q.limit;
    if (used >= limit) return '今日已達上限';
    return `剩 ${limit - used}/${limit}`;
  };

  const isQuotaExhausted = (action: 'weather' | 'places' | 'optimize') => {
    if (!quota || quota.isAdmin) return false;
    const q = quota[action];
    return q ? q.count >= (q.limit ?? 10) : false;
  };

  const canUse = (action: 'weather' | 'places' | 'optimize') => {
    return isMember && !isQuotaExhausted(action);
  };

  const ACTION_LABELS: Record<string, string> = { weather: '天氣', places: '景點', optimize: '排序' };

  return (
    <>
      <div className="flex flex-col h-full bg-zinc-950 rounded-3xl border border-zinc-800 overflow-hidden">

        {/* AI 功能按鈕區 */}
        <div className="px-4 py-4 border-b border-zinc-800/50 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {/* 更新天氣 */}
            <button
              type="button"
              disabled={!isMember || isWeatherUpdating || loading || isQuotaExhausted('weather')}
              onClick={handleUpdateWeather}
              className={clsx(
                'flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border transition-all',
                isMember && !isQuotaExhausted('weather')
                  ? 'text-orange-500 hover:bg-orange-500/10 border-orange-500/20 active:scale-95'
                  : 'text-zinc-600 border-zinc-800 opacity-40 cursor-not-allowed'
              )}
            >
              {isWeatherUpdating
                ? <Loader2 size={18} className="animate-spin shrink-0" />
                : <CloudSun size={18} className="shrink-0" />}
              <div className="text-center leading-none">
                <div className="text-[10px] font-black tracking-wide">更新天氣</div>
                <div className={clsx('text-[8px] mt-0.5', isQuotaExhausted('weather') ? 'text-red-500/70' : 'text-orange-500/50')}>
                  {!isMember ? '需為成員' : isQuotaExhausted('weather') ? '今日已達上限' : '1小時快取'}
                </div>
                {isMember && !quota?.isAdmin && (
                  <div className="text-[8px] text-zinc-600 mt-0.5">{getQuotaLabel('weather')}</div>
                )}
              </div>
            </button>

            {/* 更新景點 */}
            <button
              type="button"
              disabled={!isMember || isPlacesUpdating || loading || isQuotaExhausted('places')}
              onClick={handleUpdatePlaces}
              className={clsx(
                'flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border transition-all',
                isMember && !isQuotaExhausted('places')
                  ? 'text-orange-500 hover:bg-orange-500/10 border-orange-500/20 active:scale-95'
                  : 'text-zinc-600 border-zinc-800 opacity-40 cursor-not-allowed'
              )}
            >
              {isPlacesUpdating
                ? <Loader2 size={18} className="animate-spin shrink-0" />
                : <MapPin size={18} className="shrink-0" />}
              <div className="text-center leading-none">
                <div className="text-[10px] font-black tracking-wide">更新景點 💰</div>
                <div className={clsx('text-[8px] mt-0.5', isQuotaExhausted('places') ? 'text-red-500/70' : 'text-orange-500/50')}>
                  {!isMember ? '需為成員' : isQuotaExhausted('places') ? '今日已達上限' : '1小時快取'}
                </div>
                {isMember && !quota?.isAdmin && (
                  <div className="text-[8px] text-zinc-600 mt-0.5">{getQuotaLabel('places')}</div>
                )}
              </div>
            </button>

            {/* 規則排序 */}
            <button
              type="button"
              disabled={!isMember || optimizingMode !== null || loading || isQuotaExhausted('optimize')}
              onClick={() => handleOptimize('rule')}
              className={clsx(
                'flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border transition-all',
                isMember && !isQuotaExhausted('optimize')
                  ? 'text-blue-400 hover:bg-blue-500/10 border-blue-500/20 active:scale-95'
                  : 'text-zinc-600 border-zinc-800 opacity-40 cursor-not-allowed'
              )}
            >
              {optimizingMode === 'rule'
                ? <Loader2 size={18} className="animate-spin shrink-0" />
                : <Wand2 size={18} className="shrink-0" />}
              <div className="text-center leading-none">
                <div className="text-[10px] font-black tracking-wide">規則排序</div>
                <div className={clsx('text-[8px] mt-0.5', isQuotaExhausted('optimize') ? 'text-red-500/70' : 'text-blue-400/60')}>
                  {!isMember ? '需為成員' : isQuotaExhausted('optimize') ? '今日已達上限' : '快速穩定'}
                </div>
                {isMember && !quota?.isAdmin && (
                  <div className="text-[8px] text-zinc-600 mt-0.5">{getQuotaLabel('optimize')}</div>
                )}
              </div>
            </button>

            {/* AI 排序 */}
            <button
              type="button"
              disabled={!isMember || optimizingMode !== null || loading || isQuotaExhausted('optimize')}
              onClick={() => handleOptimize('ai')}
              className={clsx(
                'flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border transition-all',
                isMember && !isQuotaExhausted('optimize')
                  ? 'text-orange-500 hover:bg-orange-500/10 border-orange-500/20 active:scale-95'
                  : 'text-zinc-600 border-zinc-800 opacity-40 cursor-not-allowed'
              )}
            >
              {optimizingMode === 'ai'
                ? <Loader2 size={18} className="animate-spin shrink-0" />
                : <Sparkles size={18} className="shrink-0" />}
              <div className="text-center leading-none">
                <div className="text-[10px] font-black tracking-wide">AI 排序 💰</div>
                <div className={clsx('text-[8px] mt-0.5', isQuotaExhausted('optimize') ? 'text-red-500/70' : 'text-orange-500/50')}>
                  {!isMember ? '需為成員' : isQuotaExhausted('optimize') ? '今日已達上限' : 'Gemini AI'}
                </div>
                {isMember && !quota?.isAdmin && (
                  <div className="text-[8px] text-zinc-600 mt-0.5">{getQuotaLabel('optimize')}</div>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* 表單內容 */}
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <TripBaseForm
            initialData={trip}
            onSubmit={handleAutoSave}
            loading={loading}
            submitText="儲存"
            onChange={handleAutoSave}
            hideSubmit={true}
            extraButtons={
              <div className="mt-6 space-y-3">
                {/* Admin quota management panel */}
                {user?.role === 'Admin' && (
                  <div className="border border-zinc-800 rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowAdminPanel(p => !p)}
                      className="w-full flex items-center justify-between px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors"
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest">成員使用量管理（今日）</span>
                      {showAdminPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <AnimatePresence>
                      {showAdminPanel && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 space-y-2 border-t border-zinc-800">
                            {adminMembersLoading ? (
                              <div className="flex justify-center py-4">
                                <Loader2 size={18} className="animate-spin text-zinc-500" />
                              </div>
                            ) : adminMembers.length === 0 ? (
                              <p className="text-[10px] text-zinc-600 text-center py-3">無成員資料</p>
                            ) : (
                              adminMembers.map(m => (
                                <div key={m.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] font-bold text-zinc-300 truncate">{m.name}</div>
                                    <div className="flex gap-2 mt-0.5">
                                      {(['weather', 'places', 'optimize'] as const).map(action => {
                                        const count = m.quota?.[action]?.count ?? 0;
                                        const limit = m.quota?.[action]?.limit ?? 10;
                                        return (
                                          <span key={action} className={clsx(
                                            'text-[9px] font-bold',
                                            count >= limit ? 'text-red-400' : 'text-zinc-500'
                                          )}>
                                            {ACTION_LABELS[action]} {count}/{limit}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleResetMemberQuota(m.id)}
                                    className="ml-3 flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800 transition-colors"
                                  >
                                    <RotateCcw size={10} />
                                    重設
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <div className="pt-3 border-t border-zinc-800/50">
                  <button
                    type="button"
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    className="w-full bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-500 font-bold rounded-2xl py-4 transition-colors border border-red-500/20 flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} />
                    <span className="uppercase tracking-widest text-xs font-black">刪除行程</span>
                  </button>
                </div>
              </div>
            }
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="刪除行程"
        message={`確定要刪除「${trip.title}」嗎？\n所有活動、記帳與預訂資料都將一併移除，此操作無法復原。`}
        confirmText="永久刪除"
        cancelText="取消"
        type="danger"
        onConfirm={async () => {
          await onDelete();
          setIsDeleteConfirmOpen(false);
        }}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />

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
              <h3 className="text-lg font-black text-white uppercase tracking-widest mb-3 relative z-10">日期衝突</h3>
              <p className="text-sm text-zinc-400 mb-4 leading-relaxed relative z-10">
                超出範圍的活動：<br />
                <span className="font-mono font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-lg block mt-3 inline-block">
                  {outOfBoundsDates.join(', ')}
                </span>
              </p>
              <div className="flex w-full gap-3 relative z-10">
                <button
                  onClick={() => setPendingSaveData(null)}
                  className="flex-1 py-4 bg-zinc-800 text-white font-bold rounded-2xl transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => performSave(pendingSaveData)}
                  disabled={loading}
                  className="flex-[1.5] py-4 bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-widest text-[12px] rounded-2xl transition-colors shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : '強制儲存'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
