import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { format, parseISO, addDays, differenceInDays, isSameDay, addMinutes, isBefore, startOfDay } from 'date-fns';
import { Map, Info, Wallet, ArrowLeft, Settings, Edit3, ChevronsUpDown, ChevronsDownUp, Unlock, Loader2, Camera, CheckCircle2, XCircle } from 'lucide-react';
import { Trip, Itinerary, Expense, Booking } from '../../types';
import { clsx } from 'clsx';
import { db } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { apiFetch } from '../../utils/api';
import { FinanceForm } from '../../components/forms/FinanceForm';
import { NextTransportForm } from '../../components/forms/NextTransportForm';
import { ItineraryForm } from '../../components/forms/ItineraryForm';
import { TripSettingsForm } from '../../components/forms/TripSettingsForm';
import { WeatherWidget, getWeatherIcon } from '../../components/widgets/WeatherWidget';
import { BookingForm } from '../../components/forms/BookingForm';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { useTripData } from '../../hooks/useTripData';
import { ItineraryTab } from './ItineraryTab';
import { InfoTab } from './InfoTab';
import { FinanceTab } from './FinanceTab';

const parseTime = (timeStr: string, baseDate: Date) => {
  if (!timeStr) return baseDate;
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(hours || 0, minutes || 0, 0, 0);
  return d;
};

const getEffectiveTimes = (item: any, baseDate: Date) => {
  let start = parseTime(item.start_time, baseDate);
  let end = parseTime(item.end_time || item.start_time, baseDate);
  if (item.next_transport_mode) {
    let addMins = 0;
    if (item.next_transport_time) {
      addMins = parseInt(item.next_transport_time.replace(/\D/g, '')) || 0;
    } else if (item.next_transport_auto_time) {
      addMins = parseInt(item.next_transport_auto_time.replace(/\D/g, '')) || 0;
    }
    end = addMinutes(end, addMins);
  }
  return { start, end };
};

const safeParse = (dateStr: any) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  try {
    const parsed = parseISO(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch (e) { return null; }
};

function getTripCoverImage(trip: any): string {
  if (trip?.cover_image_url && typeof trip.cover_image_url === 'string' && trip.cover_image_url.startsWith('http')) {
    return trip.cover_image_url;
  }
  const seed = trip?.id || 1;
  return `https://picsum.photos/seed/${seed}/1920/1080`;
}

// ── 日期列天氣摘要的 hook ──────────────────────────────────────────────
function useDateWeather(tripId: number, date: Date | null) {
  const [summary, setSummary] = useState<{ max_temp: number; min_temp: number; weather_code: number } | null>(null);

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    const load = async () => {
      try {
        const dateStr = format(date, 'yyyy-MM-dd');
        const res = await apiFetch(`/api/trips/${tripId}/weather?date=${dateStr}`);
        if (res.ok) {
          const json = await res.json() as any;
          if (!cancelled) setSummary(json?.summary ?? null);
        }
      } catch { /* silent */ }
    };
    load();
    return () => { cancelled = true; };
  }, [tripId, date]);

  return summary;
}

// ── Toast notification ────────────────────────────────────────────────
interface ToastProps {
  message: string;
  type: 'success' | 'error';
  visible: boolean;
}
function Toast({ message, type, visible }: ToastProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          className={clsx(
            'fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold text-white whitespace-nowrap',
            type === 'success' ? 'bg-emerald-600 shadow-emerald-900/40' : 'bg-red-600 shadow-red-900/40'
          )}
        >
          {type === 'success' ? <CheckCircle2 size={16} strokeWidth={2.5} /> : <XCircle size={16} strokeWidth={2.5} />}
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TripDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAppStore();
  const { refreshTripData } = useTripData(id);

  const trip     = useLiveQuery(() => db.trips.get(Number(id) || 0), [id]);
  const itineraries = useLiveQuery(() => db.itineraries.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const expenses = useLiveQuery(() => db.expenses.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const members  = useLiveQuery(() => db.tripMembers.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const bookings = useLiveQuery(() => db.bookings.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];

  const [activeTab, setActiveTab] = useState<'itinerary' | 'info' | 'finance' | 'settings'>('itinerary');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [bookingFilter, setBookingFilter] = useState<string>('ALL');

  // ── 封面圖展開/收起 ──────────────────────────────────────────────────
  const [isCoverExpanded, setIsCoverExpanded] = useState(false);

  // ── Expand/Collapse 所有行程卡片 ─────────────────────────────────────
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [expandSignal, setExpandSignal]   = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);

  // ── Weather Modal ────────────────────────────────────────────────────
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);

  // ── Toast ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false
  });
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2500);
  }, []);

  const toggleExpandAll = () => {
    const next = !isAllExpanded;
    setIsAllExpanded(next);
    if (next) setExpandSignal(s => s + 1);
    else setCollapseSignal(s => s + 1);
  };

  useEffect(() => { refreshTripData(); }, [refreshTripData]);

  useEffect(() => {
    if (trip?.start_date && trip?.end_date) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      if (todayStr >= trip.start_date && todayStr <= trip.end_date) {
        const todayParsed = safeParse(todayStr);
        if (todayParsed) { setSelectedDate(todayParsed); return; }
      }
      const parsedStart = safeParse(trip.start_date);
      if (parsedStart) setSelectedDate(parsedStart);
    }
  }, [trip?.start_date, trip?.end_date]);

  const [isFinanceFormOpen, setIsFinanceFormOpen]         = useState(false);
  const [isItineraryFormOpen, setIsItineraryFormOpen]     = useState(false);
  const [isNextTransportFormOpen, setIsNextTransportFormOpen] = useState(false);
  const [isBookingFormOpen, setIsBookingFormOpen]         = useState(false);

  const [editingItinerary, setEditingItinerary] = useState<Itinerary | null>(null);
  const [editingExpense,   setEditingExpense]   = useState<Expense | null>(null);
  const [editingBooking,   setEditingBooking]   = useState<Booking | null>(null);

  const [isEditMode, setIsEditMode] = useState(false);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean; title: string; message: string;
    confirmText?: string; cancelText?: string; onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', confirmText: 'Confirm', onConfirm: () => {} });

  const tripUsers = useLiveQuery(async () => {
    if (!id) return [];
    const tripMembersArr = await db.tripMembers.where('trip_id').equals(Number(id)).toArray();
    const userIds = tripMembersArr.map(m => m.user_id);
    return db.users.where('id').anyOf(userIds).toArray();
  }, [id]);

  const handleDeleteItinerary = async (itineraryId: number) => {
    setConfirmConfig({
      isOpen: true, title: '刪除活動', message: '確定要刪除此活動嗎？此操作無法復原。', confirmText: '刪除活動',
      onConfirm: async () => {
        if (!id) return;
        try {
          const res = await apiFetch(`/api/trips/${id}/itineraries/${itineraryId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete itinerary');
          await db.itineraries.delete(itineraryId);
          setIsItineraryFormOpen(false); setEditingItinerary(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) { console.error(err); alert('刪除活動失敗'); }
      }
    });
  };

  const handleDeleteBooking = async (bookingId: number) => {
    setConfirmConfig({
      isOpen: true, title: '刪除訂票', message: '確定要刪除此訂票資訊嗎？', confirmText: '刪除訂票',
      onConfirm: async () => {
        if (!id) return;
        try {
          const res = await apiFetch(`/api/trips/${id}/bookings/${bookingId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete booking');
          await db.bookings.delete(bookingId);
          const relatedItineraries = itineraries.filter(i =>
            i.related_id === bookingId && ['TRANSPORTATION', 'ACCOMMODATION', 'RENTAL'].includes(i.type)
          );
          if (relatedItineraries.length > 0) await db.itineraries.bulkDelete(relatedItineraries.map(i => i.id));
          setIsBookingFormOpen(false); setEditingBooking(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) { console.error(err); alert('刪除訂票失敗'); }
      }
    });
  };

  const isMember = user && (
    members.some(m => Number(m.user_id) === Number(user.id)) ||
    trip?.members?.some((m: any) => Number(m.user_id) === Number(user.id))
  );
  const hasAccess         = trip?.is_public || isMember || user?.role === 'Admin';
  const hasEditPermission = isMember || user?.role === 'Admin';
  const canEdit           = hasEditPermission && isEditMode;

  const validTripStartDate = trip?.start_date ? safeParse(trip.start_date) : null;
  const validTripEndDate   = trip?.end_date   ? safeParse(trip.end_date)   : null;

  const isFutureTrip = useMemo(() => {
    if (!validTripStartDate) return false;
    return !isBefore(startOfDay(validTripStartDate), startOfDay(new Date()));
  }, [validTripStartDate]);

  const dates = useMemo(() => {
    if (!validTripStartDate || !validTripEndDate) return [];
    const daysCount = differenceInDays(validTripEndDate, validTripStartDate) + 1;
    return Array.from({ length: daysCount }, (_, i) => addDays(validTripStartDate, i));
  }, [validTripStartDate, validTripEndDate]);

  const filteredItineraries = useMemo(() => {
    if (!selectedDate) return [];
    return itineraries.filter(item => {
      const itemDate = safeParse(item.date);
      return itemDate && isSameDay(itemDate, selectedDate);
    }).sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [itineraries, selectedDate]);

  const conflictedIdsInView = useMemo(() => {
    const conflicts = new Set<number>();
    for (let i = 0; i < filteredItineraries.length - 1; i++) {
      const curr = filteredItineraries[i];
      const next = filteredItineraries[i + 1];
      if (curr.start_time && curr.end_time && next.start_time && next.end_time) {
        if (!selectedDate) continue;
        const currTimes = getEffectiveTimes(curr, selectedDate);
        const nextTimes = getEffectiveTimes(next, selectedDate);
        if (currTimes.end > nextTimes.start) { conflicts.add(curr.id); conflicts.add(next.id); }
      }
    }
    return conflicts;
  }, [filteredItineraries, selectedDate]);

  const filteredExpenses = useMemo(() => {
    if (!selectedDate) return [];
    return expenses.filter(exp => {
      const expDate = safeParse(exp.date);
      return expDate && isSameDay(expDate, selectedDate);
    }).sort((a, b) => b.amount - a.amount);
  }, [expenses, selectedDate]);

  const getUserNameById = (uid: number) => {
    const found = tripUsers?.find(u => u.id === uid);
    return found ? found.name : 'Unknown';
  };

  const tripCoverImageUrl = getTripCoverImage(trip);

  const availableBookingCategories = useMemo(() => {
    const cats = new Set(bookings.map(b => b.category));
    return ['ALL', ...Array.from(cats)];
  }, [bookings]);

  const selectedDateWeather = useDateWeather(Number(id), selectedDate);

  if (!trip || !hasAccess) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden overscroll-none">

      {/* ══════════════════════════════════════════════════
          HEADER SECTION
          - 封面圖展開時：圖片全寬，標題/按鈕浮在圖片上
          - 封面圖收起時：純黑 header bar，兩行佈局
      ══════════════════════════════════════════════════ */}
      <div className="shrink-0 z-30 relative w-full">
        <AnimatePresence initial={false}>
          {isCoverExpanded ? (
            /* ─── 展開狀態：封面圖全寬，所有元素浮層 ─── */
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 220, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: 'easeInOut' }}
              className="relative w-full overflow-hidden"
              style={{ paddingTop: 'env(safe-area-inset-top)' }}
            >
              {/* 封面圖 */}
              <img
                src={tripCoverImageUrl}
                alt={trip.title}
                className="absolute inset-0 w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              {/* 漸層遮罩：上下皆深 */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80 pointer-events-none" />

              {/* 頂部工具列（浮在圖上） */}
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3">
                <button
                  onClick={() => navigate('/')}
                  className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/20"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-2">
                  {/* 相片收起按鈕 */}
                  <button
                    onClick={() => setIsCoverExpanded(false)}
                    className="p-2 bg-orange-500/80 backdrop-blur-md rounded-full text-white border border-orange-400/40"
                    title="Hide cover"
                  >
                    <Camera size={18} />
                  </button>
                  {hasEditPermission && (
                    <button
                      onClick={() => setIsEditMode(v => !v)}
                      className={clsx(
                        'p-2 rounded-full transition-all border backdrop-blur-md',
                        isEditMode
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-black/40 text-white border-white/20'
                      )}
                    >
                      {isEditMode ? <Unlock size={18} /> : <Edit3 size={18} />}
                    </button>
                  )}
                </div>
              </div>

              {/* 底部：行程標題 + 天氣（浮在圖片上） */}
              <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 flex items-end justify-between">
                <h1
                  className="flex-1 text-xl font-black text-white truncate tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] mr-3"
                  title={trip.title}
                >
                  {trip.title}
                </h1>
                {/* 天氣（可點擊打開 Modal） */}
                {selectedDateWeather && (
                  <button
                    onClick={() => setIsWeatherModalOpen(true)}
                    className="shrink-0 flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-2xl px-3 py-2 border border-white/10 hover:bg-black/60 transition-all active:scale-95"
                  >
                    {getWeatherIcon(selectedDateWeather.weather_code, 20)}
                    <div className="flex flex-col items-start leading-none">
                      <span className="text-[11px] font-bold text-white">{selectedDateWeather.max_temp}°</span>
                      <span className="text-[9px] text-zinc-300">{selectedDateWeather.min_temp}°</span>
                    </div>
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            /* ─── 收起狀態：純黑 header bar，兩行 ─── */
            <motion.div
              key="collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full bg-black/95 backdrop-blur-xl border-b border-zinc-800 flex flex-col"
              style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
            >
              {/* Row 1: 返回 + 右側按鈕 */}
              <div className="flex items-center justify-between px-4 mb-2">
                <button
                  onClick={() => navigate('/')}
                  className="p-2 bg-zinc-900 rounded-full text-white hover:bg-zinc-800 transition-colors border border-zinc-700"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex items-center gap-2">
                  {/* 相片展開按鈕 */}
                  <button
                    onClick={() => setIsCoverExpanded(true)}
                    className="p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all border border-zinc-700"
                    title="Show cover photo"
                  >
                    <Camera size={18} />
                  </button>
                  {hasEditPermission && (
                    <button
                      onClick={() => setIsEditMode(v => !v)}
                      className={clsx(
                        'p-2 rounded-full transition-all border',
                        isEditMode
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800 border-zinc-700'
                      )}
                    >
                      {isEditMode ? <Unlock size={18} /> : <Edit3 size={18} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: 標題 + 天氣按鈕 */}
              <div className="flex items-center justify-between px-4">
                <h1
                  className="flex-1 text-base font-black text-white truncate tracking-tight mr-2"
                  title={trip.title}
                >
                  {trip.title}
                </h1>
                {selectedDateWeather ? (
                  /* ── 天氣可點擊按鈕 ── */
                  <button
                    onClick={() => setIsWeatherModalOpen(true)}
                    className="shrink-0 flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-xl px-2.5 py-1.5 border border-zinc-700 hover:border-zinc-500 transition-all"
                  >
                    {getWeatherIcon(selectedDateWeather.weather_code, 16)}
                    <span className="text-[11px] font-bold text-white leading-none">{selectedDateWeather.min_temp}°</span>
                    <span className="text-[9px] text-zinc-400 leading-none">/</span>
                    <span className="text-[11px] font-bold text-orange-400 leading-none">{selectedDateWeather.max_temp}°</span>
                  </button>
                ) : (
                  <div className="shrink-0 w-8" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 日期列 ───────────────────────────────────────────────────── */}
      {(activeTab === 'itinerary' || activeTab === 'finance') && (
        <div className="bg-black/95 backdrop-blur-xl border-b border-zinc-800 py-3 px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex overflow-x-auto gap-3 no-scrollbar pb-1 flex-1">
              {dates.map((date, index) => {
                const isActive = isSameDay(date, selectedDate || new Date());
                return (
                  <button
                    key={index}
                    onClick={() => setSelectedDate(date)}
                    className={clsx(
                      'flex flex-col items-center justify-center min-w-[56px] h-16 rounded-xl transition-all shrink-0',
                      isActive
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 scale-105'
                        : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800'
                    )}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
                      {format(date, 'EEE')}
                    </span>
                    <span className="text-lg font-bold mt-0.5">{format(date, 'd')}</span>
                  </button>
                );
              })}
            </div>

            {/* Expand/Collapse all 按鈕 */}
            <button
              onClick={toggleExpandAll}
              className={clsx(
                'shrink-0 flex flex-col items-center justify-center w-12 h-16 rounded-2xl transition-all border',
                isAllExpanded
                  ? 'bg-gradient-to-b from-orange-500 to-orange-600 border-orange-400/50 text-white shadow-[0_4px_20px_rgba(249,115,22,0.4)]'
                  : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-lg'
              )}
            >
              {isAllExpanded
                ? <ChevronsDownUp size={18} strokeWidth={2.5} />
                : <ChevronsUpDown size={18} strokeWidth={2.5} />
              }
              <span className="text-[8px] font-black uppercase tracking-widest mt-1 opacity-80">
                {isAllExpanded ? '收合' : '展開'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── 主要內容區 ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 pb-32 custom-scrollbar overscroll-none">

        {activeTab === 'itinerary' && (
          <ItineraryTab
            tripId={Number(id)}
            selectedDate={selectedDate}
            isFutureTrip={isFutureTrip}
            filteredItineraries={filteredItineraries}
            conflictedIdsInView={conflictedIdsInView}
            bookings={bookings as Booking[]}
            canEdit={canEdit}
            expandSignal={expandSignal}
            collapseSignal={collapseSignal}
            onAddActivity={() => { setEditingItinerary(null); setIsItineraryFormOpen(true); }}
            onEditItinerary={(item) => { setEditingItinerary(item); setIsItineraryFormOpen(true); }}
            onEditNextTransport={(item) => { setEditingItinerary(item); setIsNextTransportFormOpen(true); }}
            onEditBooking={(booking) => { setEditingBooking(booking); setIsBookingFormOpen(true); }}
          />
        )}

        {activeTab === 'info' && (
          <InfoTab
            expenses={expenses as any}
            tripUsers={tripUsers || []}
            currency={trip.currencies?.[0] || 'TWD'}
            bookings={bookings as Booking[]}
            bookingFilter={bookingFilter}
            setBookingFilter={setBookingFilter}
            availableBookingCategories={availableBookingCategories}
            canEdit={canEdit}
            onAddBooking={() => { setEditingBooking(null); setIsBookingFormOpen(true); }}
            onEditBooking={(booking) => { setEditingBooking(booking); setIsBookingFormOpen(true); }}
          />
        )}

        {activeTab === 'finance' && (
          <FinanceTab
            filteredExpenses={filteredExpenses as any}
            currency={trip.currencies?.[0] || 'TWD'}
            canEdit={canEdit}
            getUserNameById={getUserNameById}
            onAddExpense={() => { setEditingExpense(null); setIsFinanceFormOpen(true); }}
            onEditExpense={(expense) => { setEditingExpense(expense); setIsFinanceFormOpen(true); }}
          />
        )}

        {activeTab === 'settings' && hasEditPermission && (
          <TripSettingsForm
            trip={trip} onUpdate={refreshTripData}
            onDelete={async () => {
              try {
                await apiFetch(`/api/trips/${id}`, { method: 'DELETE' });
                await db.trips.delete(Number(id));
                navigate('/');
              } catch (e) { showToast('刪除失敗', 'error'); }
            }}
            onClose={() => setActiveTab('itinerary')}
            showToast={showToast}
          />
        )}
      </div>

      {/* Footer Navigation */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-around px-4 pt-2 z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
        style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
      >
        {[
          { tab: 'itinerary', icon: Map,    label: '行程' },
          { tab: 'info',      icon: Info,   label: '訂票' },
          { tab: 'finance',   icon: Wallet, label: '記帳' },
        ].map(({ tab, icon: Icon, label }) => (
          <button key={tab} onClick={() => setActiveTab(tab as any)}
            className={clsx('flex flex-col items-center justify-center w-full h-14 gap-1 rounded-2xl transition-all duration-300',
              activeTab === tab ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            )}>
            <Icon size={activeTab === tab ? 24 : 22} className="transition-all duration-300" />
            <span className="text-[10px] font-bold tracking-wide">{label}</span>
          </button>
        ))}
        {hasEditPermission && (
          <button onClick={() => setActiveTab('settings')}
            className={clsx('flex flex-col items-center justify-center w-full h-14 gap-1 rounded-2xl transition-all duration-300',
              activeTab === 'settings' ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            )}>
            <Settings size={activeTab === 'settings' ? 24 : 22} className="transition-all duration-300" />
            <span className="text-[10px] font-bold tracking-wide">Settings</span>
          </button>
        )}
      </div>

      {/* ── Weather Modal（點擊天氣按鈕後跳出） ──────────────────────── */}
      <AnimatePresence>
        {isWeatherModalOpen && id && (
          <div className="fixed inset-0 z-[200] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsWeatherModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 36 }}
              className="relative w-full max-w-lg bg-zinc-950 border-t border-zinc-800 rounded-t-[32px] overflow-hidden p-5 pb-10"
            >
              <WeatherWidget
                tripId={Number(id)}
                date={selectedDate}
                isFutureTrip={isFutureTrip}
                forceExpanded={true}
                onClose={() => setIsWeatherModalOpen(false)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />

      {/* Modals */}
      <AnimatePresence>
        {isItineraryFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="w-full max-w-md max-h-[90vh]">
              <ItineraryForm
                tripId={Number(id)}
                date={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
                initialData={editingItinerary}
                onSuccess={() => { setIsItineraryFormOpen(false); setEditingItinerary(null); refreshTripData(); }}
                onCancel={() => { setIsItineraryFormOpen(false); setEditingItinerary(null); }}
              />
            </motion.div>
          </div>
        )}

        {isFinanceFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="w-full max-w-md max-h-[90vh]">
              <FinanceForm
                tripId={String(id)}
                defaultDate={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined}
                currencies={trip.currencies || ['TWD']}
                initialData={editingExpense}
                onSuccess={() => { setIsFinanceFormOpen(false); setEditingExpense(null); refreshTripData(); }}
                onCancel={() => { setIsFinanceFormOpen(false); setEditingExpense(null); }}
              />
            </motion.div>
          </div>
        )}

        {isBookingFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="w-full max-w-md bg-zinc-900 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <BookingForm
                initialData={editingBooking}
                onSubmit={async (data) => {
                  if (!id) return;
                  try {
                    const endpoint = editingBooking ? `/api/trips/${id}/bookings/${editingBooking.id}` : `/api/trips/${id}/bookings`;
                    const method = editingBooking ? 'PUT' : 'POST';
                    await apiFetch(endpoint, { method, body: JSON.stringify(data) });
                    setIsBookingFormOpen(false); setEditingBooking(null); refreshTripData();
                  } catch (e) { alert('儲存訂票失敗'); }
                }}
                onCancel={() => { setIsBookingFormOpen(false); setEditingBooking(null); }}
              />
              {editingBooking && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <button onClick={() => handleDeleteBooking(editingBooking.id)}
                    className="w-full py-3 text-red-500 bg-red-500/10 hover:bg-red-500/20 font-bold rounded-xl transition-colors">
                    Delete Booking
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}

        {isNextTransportFormOpen && editingItinerary && (
          <NextTransportForm
            isOpen={isNextTransportFormOpen}
            onClose={() => { setIsNextTransportFormOpen(false); setEditingItinerary(null); }}
            itinerary={editingItinerary}
            onSave={async (data) => {
              if (!id) return;
              try {
                await apiFetch(`/api/trips/${id}/itineraries/${editingItinerary.id}`, {
                  method: 'PUT', body: JSON.stringify({ ...editingItinerary, ...data })
                });
                setIsNextTransportFormOpen(false); setEditingItinerary(null); refreshTripData();
              } catch (e) { alert('儲存交通資訊失敗'); }
            }}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmConfig.isOpen} title={confirmConfig.title} message={confirmConfig.message}
        confirmText={confirmConfig.confirmText} onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}