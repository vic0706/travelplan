import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { format, parseISO, addDays, differenceInDays, isSameDay, addMinutes, isBefore, startOfDay } from 'date-fns';
import { Map, Info, Wallet, ArrowLeft, Settings, Edit3, ChevronsUpDown, ChevronsDownUp, RotateCcw, Unlock, Loader2, Camera, CheckCircle2, XCircle, X } from 'lucide-react';
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
    let mins = 0;
    if (item.next_transport_time) {
      mins = parseInt(item.next_transport_time.replace(/\D/g, '')) || 0;
    } else if (item.next_transport_auto_time) {
      mins = parseInt(item.next_transport_auto_time.replace(/\D/g, '')) || 0;
    }
    if (mins > 0) {
      end = addMinutes(end, mins);
      // A6: skip rounding for TRANSPORTATION (pre-check-in times must not be rounded)
      if (item.type !== 'TRANSPORTATION') {
        const remainder = end.getMinutes() % 30;
        if (remainder !== 0) end = addMinutes(end, 30 - remainder);
      }
    }
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

  // Read safe-area-inset-top for PWA header height calculation
  const [safeTop, setSafeTop] = useState(0);
  useEffect(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;';
    document.body.appendChild(el);
    setSafeTop(el.offsetHeight || 0);
    document.body.removeChild(el);
  }, []);

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

  // ── Expand/Collapse 所有行程卡片（三態：default→expanded→collapsed→default）
  type ExpandState = 'default' | 'expanded' | 'collapsed';
  const [expandState, setExpandState]     = useState<ExpandState>('default');
  const [expandSignal, setExpandSignal]   = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [defaultSignal, setDefaultSignal] = useState(0);

  // ── Weather 展開/收起（連動 ItineraryTab 的 WeatherWidget）───────────
  const [isWeatherExpanded, setIsWeatherExpanded] = useState(false);
  const handleWeatherChipClick = () => {
    if (activeTab !== 'itinerary') setActiveTab('itinerary');
    setIsWeatherExpanded(v => !v);
  };

  // ── Toast ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '', type: 'success', visible: false
  });
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2500);
  }, []);

  const toggleExpandAll = () => {
    if (expandState === 'default')    { setExpandState('expanded');  setExpandSignal(s => s + 1); }
    else if (expandState === 'expanded') { setExpandState('collapsed'); setCollapseSignal(s => s + 1); }
    else                              { setExpandState('default');   setDefaultSignal(s => s + 1); }
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
  const [bookingLoading, setBookingLoading]               = useState(false);

  const [editingItinerary, setEditingItinerary] = useState<Itinerary | null>(null);
  const [changingDateItem, setChangingDateItem] = useState<Itinerary | null>(null);
  const [editingExpense,   setEditingExpense]   = useState<Expense | null>(null);
  const [editingBooking,   setEditingBooking]   = useState<Booking | null>(null);

  const [copyTarget, setCopyTarget] = useState<Itinerary | null>(null);
  const [copyTitle,  setCopyTitle]  = useState('');
  const [copyDate,   setCopyDate]   = useState('');

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
        } catch (err) { console.error(err); showToast('刪除活動失敗', 'error'); }
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
          showToast('訂票已刪除', 'success');
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) { console.error(err); showToast('刪除訂票失敗', 'error'); }
      }
    });
  };

  const handleCopyClick = (item: Itinerary) => {
    setCopyTarget(item);
    setCopyTitle(`${item.title}（複製）`);
    setCopyDate(item.date || (selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''));
  };

  const handleCopyConfirm = async () => {
    if (!id || !copyTarget || !copyTitle.trim() || !copyDate) return;
    try {
      const payload = {
        ...copyTarget,
        title: copyTitle,
        date: copyDate,
        is_time_fixed: 0,
        start_time: '',
        end_time: '',
        tags: Array.isArray(copyTarget.tags) ? copyTarget.tags : [],
        sub_items: typeof copyTarget.sub_items === 'string' ? copyTarget.sub_items : '[]',
      };
      const { id: _id, trip_id: _tid, ...rest } = payload as any;
      const res = await apiFetch(`/api/trips/${id}/itineraries`, {
        method: 'POST',
        body: JSON.stringify(rest),
      });
      if (res.ok) {
        showToast('活動已複製', 'success');
        setCopyTarget(null);
        setTimeout(() => refreshTripData(), 300);
      } else showToast('複製失敗', 'error');
    } catch { showToast('複製失敗', 'error'); }
  };

  const handleChangeDateItinerary = async (item: Itinerary, newDate: string) => {
    if (!id) return;
    try {
      const res = await apiFetch(`/api/trips/${id}/itineraries/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...item,
          date: newDate,
          tags: Array.isArray(item.tags) ? item.tags : [],
          sub_items: typeof item.sub_items === 'string' ? item.sub_items : '[]',
        }),
      });
      if (res.ok) {
        await db.itineraries.update(item.id, { date: newDate });
        setChangingDateItem(null);
        showToast('日期已更新', 'success');
        setTimeout(() => refreshTripData(), 300);
      } else showToast('更新日期失敗', 'error');
    } catch { showToast('更新日期失敗', 'error'); }
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
    if (found) return found.name;
    if (user && Number(user.id) === Number(uid)) return user.name;
    return 'Unknown';
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
        {/* 單一 motion.div 動畫高度，避免 AnimatePresence 切換造成跑版 */}
        <motion.div
          className="relative w-full overflow-hidden"
          animate={{ height: (isCoverExpanded ? 220 : 130) + safeTop }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        >
          {/* 封面圖 */}
          <img
            src={tripCoverImageUrl}
            alt={trip.title}
            className="absolute inset-0 w-full h-full object-cover object-bottom"
            referrerPolicy="no-referrer"
          />
          {/* 漸層遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/20 to-black/80 pointer-events-none" />

          {/* 頂部工具列：top 從 safe-area-inset-top 開始，避免被狀態列遮住 */}
          <div
            className="absolute left-0 right-0 flex items-center justify-between px-4 pt-3"
            style={{ top: safeTop }}
          >
            <button
              onClick={() => navigate('/')}
              className="p-2 bg-black/40 backdrop-blur-md rounded-full text-white border border-white/20"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCoverExpanded(v => !v)}
                className={clsx(
                  'p-2 backdrop-blur-md rounded-full border transition-all',
                  isCoverExpanded
                    ? 'bg-orange-500/80 text-white border-orange-400/40'
                    : 'bg-black/40 text-zinc-300 border-white/20 hover:bg-white/20'
                )}
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
                      : 'bg-black/40 text-white border-white/20 hover:bg-white/20'
                  )}
                >
                  {isEditMode ? <Unlock size={18} /> : <Edit3 size={18} />}
                </button>
              )}
            </div>
          </div>

          {/* 底部：標題 + 天氣 */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 flex items-end justify-between">
            <h1
              className="flex-1 text-xl font-black text-white truncate tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] mr-3"
              title={trip.title}
            >
              {trip.title}
            </h1>
            {selectedDateWeather ? (
              <span
                onClick={handleWeatherChipClick}
                className={clsx(
                  'shrink-0 flex items-center gap-1.5 cursor-pointer select-none transition-opacity active:opacity-50',
                  isWeatherExpanded ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                )}
              >
                {getWeatherIcon(selectedDateWeather.weather_code, 18)}
                <span className="text-xs font-bold text-white drop-shadow">
                  {selectedDateWeather.min_temp}°/{selectedDateWeather.max_temp}°
                </span>
              </span>
            ) : (
              <div className="shrink-0 w-4" />
            )}
          </div>
        </motion.div>
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

            {/* Expand/Collapse all 按鈕（三態） */}
            <button
              onClick={toggleExpandAll}
              className="shrink-0 flex flex-col items-center justify-center w-12 h-16 rounded-2xl transition-all border bg-zinc-900/80 border-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-lg"
            >
              {expandState === 'expanded'
                ? <ChevronsDownUp size={18} strokeWidth={2.5} />
                : expandState === 'collapsed'
                  ? <RotateCcw size={16} strokeWidth={2.5} />
                  : <ChevronsUpDown size={18} strokeWidth={2.5} />
              }
              <span className="text-[8px] font-black uppercase tracking-widest mt-1 opacity-80">
                {expandState === 'expanded' ? '收合' : expandState === 'collapsed' ? '預設' : '展開'}
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
            defaultSignal={defaultSignal}
            expandState={expandState}
            isWeatherExpanded={isWeatherExpanded}
            onToggleWeather={() => setIsWeatherExpanded(v => !v)}
            onAddActivity={() => { setEditingItinerary(null); setIsItineraryFormOpen(true); }}
            onEditItinerary={(item) => { setEditingItinerary(item); setIsItineraryFormOpen(true); }}
            onEditNextTransport={(item) => { setEditingItinerary(item); setIsNextTransportFormOpen(true); }}
            onEditBooking={(booking) => { setEditingBooking(booking); setIsBookingFormOpen(true); }}
            onCopyItinerary={(item) => handleCopyClick(item)}
            onChangeDateItinerary={(item) => setChangingDateItem(item)}
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
            <span className="text-[10px] font-bold tracking-wide">設定</span>
          </button>
        )}
      </div>

      {/* Toast */}
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />

      {/* Modals */}
      <AnimatePresence>
        {isItineraryFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }} className="w-full max-w-md max-h-[90vh]">
              <ItineraryForm
                tripId={Number(id)}
                date={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
                initialData={editingItinerary}
                showToast={showToast}
                onSuccess={() => { setIsItineraryFormOpen(false); setEditingItinerary(null); setTimeout(() => refreshTripData(), 300); }}
                onCancel={() => { setIsItineraryFormOpen(false); setEditingItinerary(null); }}
              />
            </motion.div>
          </div>
        )}

        {isFinanceFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }} className="w-full max-w-md max-h-[90vh]">
              <FinanceForm
                tripId={String(id)}
                defaultDate={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined}
                currencies={trip.currencies || ['TWD']}
                initialData={editingExpense}
                showToast={showToast}
                onSuccess={() => { setIsFinanceFormOpen(false); setEditingExpense(null); setTimeout(() => refreshTripData(), 300); }}
                onCancel={() => { setIsFinanceFormOpen(false); setEditingExpense(null); }}
              />
            </motion.div>
          </div>
        )}

        {isBookingFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center p-4">
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }} className="w-full max-w-md">
              <BookingForm
                initialData={editingBooking}
                tripStartDate={trip?.start_date}
                tripEndDate={trip?.end_date}
                onSubmit={async (data) => {
                  if (!id) return;
                  setBookingLoading(true);
                  try {
                    const endpoint = editingBooking ? `/api/trips/${id}/bookings/${editingBooking.id}` : `/api/trips/${id}/bookings`;
                    const method = editingBooking ? 'PUT' : 'POST';
                    const res = await apiFetch(endpoint, { method, body: JSON.stringify(data) });
                    if (!res.ok) throw new Error('Failed');
                    showToast('訂票已儲存', 'success');
                    setIsBookingFormOpen(false); setEditingBooking(null); setTimeout(() => refreshTripData(), 300);
                  } catch (e) { showToast('儲存訂票失敗', 'error'); }
                  finally { setBookingLoading(false); }
                }}
                onCancel={() => { setIsBookingFormOpen(false); setEditingBooking(null); }}
                onDelete={editingBooking ? () => handleDeleteBooking(editingBooking.id) : undefined}
                loading={bookingLoading}
              />
            </motion.div>
          </div>
        )}

        {isNextTransportFormOpen && editingItinerary && (
          <NextTransportForm
            isOpen={isNextTransportFormOpen}
            onClose={() => { setIsNextTransportFormOpen(false); setEditingItinerary(null); }}
            itinerary={editingItinerary}
            nextItinerary={(() => {
              const sorted = [...filteredItineraries].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
              const idx = sorted.findIndex(i => i.id === editingItinerary.id);
              return idx >= 0 ? (sorted[idx + 1] ?? null) : null;
            })()}
            onSave={async (data) => {
              if (!id) return;
              try {
                const res = await apiFetch(`/api/trips/${id}/itineraries/${editingItinerary.id}`, {
                  method: 'PUT', body: JSON.stringify({ ...editingItinerary, ...data })
                });
                if (!res.ok) throw new Error('Failed');
                const isEmpty = !data.next_transport_mode;
                showToast(isEmpty ? '交通資訊已清除' : '交通已設定', 'success');
                setIsNextTransportFormOpen(false); setEditingItinerary(null); setTimeout(() => refreshTripData(), 300);
              } catch (e) { showToast('儲存交通資訊失敗', 'error'); }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {changingDateItem && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="w-full max-w-md bg-zinc-900 rounded-t-3xl border border-zinc-800 shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
                <div>
                  <h3 className="text-white font-black text-base">移動活動至</h3>
                  <p className="text-zinc-400 text-xs mt-0.5 truncate max-w-[220px]">{changingDateItem.title}</p>
                </div>
                <button onClick={() => setChangingDateItem(null)} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                {dates.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isCurrent = dateStr === changingDateItem.date;
                  return (
                    <button
                      key={dateStr}
                      disabled={isCurrent}
                      onClick={() => handleChangeDateItinerary(changingDateItem, dateStr)}
                      className={`w-full py-3.5 px-4 rounded-2xl text-left transition-all flex items-center gap-3 ${
                        isCurrent
                          ? 'bg-zinc-800/50 text-zinc-500 cursor-not-allowed'
                          : 'bg-zinc-800/30 text-white hover:bg-orange-500/20 hover:border-orange-500/40 border border-zinc-700/50 hover:text-orange-400 active:bg-orange-500/30'
                      }`}
                    >
                      <span className={`text-[10px] font-black uppercase tracking-widest w-8 ${isCurrent ? 'text-zinc-600' : 'text-zinc-500'}`}>
                        {format(date, 'EEE')}
                      </span>
                      <span className="font-bold text-sm">{format(date, 'MM/dd')}</span>
                      {isCurrent && <span className="text-[10px] text-zinc-500 ml-auto">目前日期</span>}
                    </button>
                  );
                })}
              </div>
              <div className="h-safe-bottom pb-4" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {copyTarget && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="w-full max-w-md bg-zinc-900 rounded-t-3xl border border-zinc-800 shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
                <div>
                  <h3 className="text-white font-black text-base">複製活動</h3>
                  <p className="text-zinc-500 text-xs mt-0.5">設定標題與目標日期</p>
                </div>
                <button onClick={() => setCopyTarget(null)} className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="px-4 pt-4 pb-2">
                <input
                  type="text"
                  value={copyTitle}
                  onChange={e => setCopyTitle(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-orange-500 transition-colors"
                  placeholder="活動名稱"
                />
              </div>
              <div className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {dates.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const isSelected = dateStr === copyDate;
                  const isCurrent  = dateStr === copyTarget.date;
                  return (
                    <button
                      key={dateStr}
                      onClick={() => setCopyDate(dateStr)}
                      className={`w-full py-3 px-4 rounded-2xl text-left transition-all flex items-center gap-3 border ${
                        isSelected
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                          : 'bg-zinc-800/30 text-white hover:bg-orange-500/10 border-zinc-700/50 hover:text-orange-400'
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest w-8 text-zinc-500">
                        {format(date, 'EEE')}
                      </span>
                      <span className="font-bold text-sm">{format(date, 'MM/dd')}</span>
                      {isCurrent && <span className="text-[10px] text-zinc-500 ml-auto">原始日期</span>}
                    </button>
                  );
                })}
              </div>
              <div className="px-4 pb-6">
                <button
                  onClick={handleCopyConfirm}
                  disabled={!copyTitle.trim() || !copyDate}
                  className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black rounded-2xl text-sm uppercase tracking-widest shadow-lg shadow-orange-500/20 transition-all"
                >
                  確認複製
                </button>
              </div>
              <div className="h-safe-bottom pb-4" />
            </motion.div>
          </div>
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