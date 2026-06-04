import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { format, parseISO, addDays, differenceInDays, isSameDay, isPast, addMinutes } from 'date-fns';
import { Map, Info, Wallet, ArrowLeft, Settings, Edit3, ChevronsUpDown, ChevronsDownUp, Unlock, Plus, DollarSign, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Trip, Itinerary, Expense, Booking } from '../types';
import { clsx } from 'clsx';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { apiFetch } from '../utils/api';
import { FinanceForm } from '../components/FinanceForm';
import { NextTransportForm } from '../components/NextTransportForm';
import { ItineraryForm } from '../components/ItineraryForm';
import { TripSettingsForm } from '../components/TripSettingsForm';
import { WeatherWidget, getWeatherIcon } from '../components/WeatherWidget';
import { BookingForm } from '../components/BookingForm';
import { FinanceOverview } from '../components/FinanceOverview';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { BookingCard } from '../components/BookingCard';
import { TransportationCard } from '../components/TransportationCard';
import { ItineraryCard } from '../components/ItineraryCard';
import { useTripData } from '../hooks/useTripData';

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
  // Fallback: picsum (只有 cover_image_url 真的是 null 時才用)
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

  // ── 問題 2：折疊封面圖 ────────────────────────────────────────────────
  const [isCoverExpanded, setIsCoverExpanded] = useState(false);

  // ── 問題 4：EXPAND/COLLAPSE 同時控制天氣 ─────────────────────────────
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [expandSignal, setExpandSignal]   = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);

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
      isOpen: true, title: '刪除活動', message: '您確定要刪除此活動嗎？此操作無法復原。', confirmText: '刪除活動',
      onConfirm: async () => {
        if (!id) return;
        try {
          const res = await apiFetch(`/api/trips/${id}/itineraries/${itineraryId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete itinerary');
          await db.itineraries.delete(itineraryId);
          setIsItineraryFormOpen(false); setEditingItinerary(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) { console.error(err); alert('Failed to delete activity'); }
      }
    });
  };

  const handleDeleteBooking = async (bookingId: number) => {
    setConfirmConfig({
      isOpen: true, title: '刪除預訂', message: '您確定要刪除此預訂資訊嗎？相關的行程項目也會一併刪除。', confirmText: '刪除預訂',
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
        } catch (err) { console.error(err); alert('Failed to delete booking'); }
      }
    });
  };

  const isMember = user && (
    members.some(m => Number(m.user_id) === Number(user.id)) ||
    trip?.members?.some((m: any) => Number(m.user_id) === Number(user.id))
  );
  const hasAccess        = trip?.is_public || isMember || user?.role === 'Admin';
  const hasEditPermission = isMember || user?.role === 'Admin';
  const canEdit          = hasEditPermission && isEditMode;

  const handleToggleEditMode = () => setIsEditMode(!isEditMode);

  const validTripStartDate = trip?.start_date ? safeParse(trip.start_date) : null;
  const validTripEndDate   = trip?.end_date   ? safeParse(trip.end_date)   : null;

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

  // ── 問題 3：日期列天氣摘要 ────────────────────────────────────────────
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

      {/* ── 問題 2：封面圖區塊，可折疊 ─────────────────────────────────── */}
      <div className="shrink-0 z-30 relative shadow-xl w-full">

        {/* 折疊時只顯示 header bar，展開時顯示完整封面 */}
        <AnimatePresence initial={false}>
          {isCoverExpanded && (
            <motion.div
              key="cover"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 220, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden relative w-full"
            >
              <img
                src={tripCoverImageUrl}
                alt={trip.title}
                className="absolute inset-0 w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/10 to-black/80 pointer-events-none" />

              {/* 標題（只在展開時顯示） */}
              <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 z-10">
                <h1
                  className="text-2xl font-black text-white truncate leading-tight tracking-tight drop-shadow-md"
                  title={trip.title}
                >
                  {trip.title}
                </h1>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header Bar（始終可見） */}
        <div
          className="w-full flex items-center justify-between px-4 bg-black/95 backdrop-blur-xl border-b border-zinc-800"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
        >
          {/* 返回按鈕 */}
          <button
            onClick={() => navigate('/')}
            className="p-2 bg-zinc-900 rounded-full text-white hover:bg-zinc-800 transition-colors border border-zinc-700"
          >
            <ArrowLeft size={20} />
          </button>

          {/* 標題（折疊時顯示） */}
          {!isCoverExpanded && (
            <h1 className="flex-1 text-base font-black text-white truncate mx-3 tracking-tight">
              {trip.title}
            </h1>
          )}
          {isCoverExpanded && <div className="flex-1" />}

          {/* 右側按鈕群組 */}
          <div className="flex items-center gap-2">
            {/* ── 問題 2：封面折疊按鈕 ── */}
            <button
              onClick={() => setIsCoverExpanded(v => !v)}
              className="p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border border-zinc-700"
              title={isCoverExpanded ? 'Hide cover' : 'Show cover'}
            >
              {isCoverExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {/* 編輯鎖 */}
            {hasEditPermission && (
              <button
                onClick={handleToggleEditMode}
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
      </div>

      {/* ── 日期列（itinerary / finance tab） ─────────────────────────── */}
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

            {/* ── 問題 3：選中日期的天氣摘要（替代 Travel Dates 文字） ── */}
            {selectedDateWeather ? (
              <div className="shrink-0 flex flex-col items-center justify-center gap-0.5 px-2">
                {getWeatherIcon(selectedDateWeather.weather_code, 20)}
                <span className="text-[9px] font-bold text-white leading-none">
                  {selectedDateWeather.max_temp}°
                </span>
                <span className="text-[9px] text-zinc-500 leading-none">
                  {selectedDateWeather.min_temp}°
                </span>
              </div>
            ) : (
              // 天氣尚未載入時顯示空白佔位，避免版面跳動
              <div className="shrink-0 w-10" />
            )}

            {/* ── 問題 4：Expand/Collapse 按鈕，同時控制 WeatherWidget ── */}
            <button
              onClick={toggleExpandAll}
              className={clsx(
                'shrink-0 flex flex-col items-center justify-center w-12 h-16 rounded-2xl transition-all border',
                isAllExpanded
                  ? 'bg-gradient-to-b from-orange-500 to-orange-600 border-orange-400/50 text-white shadow-[0_4px_20px_rgba(249,115,22,0.4)]'
                  : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-lg backdrop-blur-sm'
              )}
            >
              {isAllExpanded
                ? <ChevronsDownUp size={18} strokeWidth={2.5} />
                : <ChevronsUpDown size={18} strokeWidth={2.5} />
              }
              <span className="text-[8px] font-black uppercase tracking-widest mt-1 opacity-80">
                {isAllExpanded ? 'Collapse' : 'Expand'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── 主要內容區 ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 pb-32 custom-scrollbar overscroll-none">

        {/* ITINERARY TAB */}
        {activeTab === 'itinerary' && (
          <div className="space-y-6">
            {/* ── 問題 4：WeatherWidget 由 isAllExpanded 控制顯示 ── */}
            {id && (
              <WeatherWidget
                tripId={Number(id)}
                date={selectedDate}
                isExpanded={isAllExpanded}
              />
            )}

            <div className="space-y-4">
              {filteredItineraries.length > 0 ? (
                filteredItineraries.map((item, index) => {
                  if (item.type === 'TRANSPORTATION' && item.related_id) {
                    const booking = bookings.find(b => b.id === item.related_id);
                    if (booking) {
                      return (
                        <TransportationCard
                          key={`transport-${item.id}`}
                          item={item}
                          booking={booking}
                          canEdit={canEdit}
                          isConflicted={conflictedIdsInView.has(item.id)}
                          onEdit={() => { setEditingBooking(booking); setIsBookingFormOpen(true); }}
                          showNextTransport={index < filteredItineraries.length - 1}
                          onEditNextTransport={() => { setEditingItinerary(item); setIsNextTransportFormOpen(true); }}
                          selectedDate={selectedDate || new Date()}
                          expandSignal={expandSignal}
                          collapseSignal={collapseSignal}
                        />
                      );
                    }
                  }
                  return (
                    <div key={`itinerary-${item.id}`} className="space-y-2">
                      <ItineraryCard
                        item={item}
                        canEdit={canEdit}
                        isConflicted={conflictedIdsInView.has(item.id)}
                        onEdit={() => { setEditingItinerary(item); setIsItineraryFormOpen(true); }}
                        showNextTransport={true}
                        onEditNextTransport={() => { setEditingItinerary(item); setIsNextTransportFormOpen(true); }}
                        expandSignal={expandSignal}
                        collapseSignal={collapseSignal}
                      />
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
                  <p>No activities for this day.</p>
                </div>
              )}

              {canEdit && (
                <button
                  onClick={() => { setEditingItinerary(null); setIsItineraryFormOpen(true); }}
                  className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
                >
                  <Plus size={20} /><span className="font-medium">Add Activity</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-white mb-6">Expenses Overview</h3>
              <FinanceOverview expenses={expenses} members={tripUsers || []} currency={trip.currencies?.[0] || 'TWD'} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Bookings</h4>
                {canEdit && (
                  <button
                    onClick={() => { setEditingBooking(null); setIsBookingFormOpen(true); }}
                    className="p-2 bg-orange-500/10 text-orange-500 rounded-full hover:bg-orange-500/20 transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                )}
              </div>

              {bookings.length > 0 ? (
                <>
                  {availableBookingCategories.length > 2 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar px-2 pb-2">
                      {availableBookingCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setBookingFilter(cat)}
                          className={clsx(
                            'px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border',
                            bookingFilter === cat
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    {bookings
                      .filter(b => bookingFilter === 'ALL' || b.category === bookingFilter)
                      .sort((a, b) => {
                        const now = new Date();
                        const dateA = parseISO(`${a.start_date}T${a.start_time}`);
                        const dateB = parseISO(`${b.start_date}T${b.start_time}`);
                        const aPast = isPast(dateA) && !isSameDay(dateA, now);
                        const bPast = isPast(dateB) && !isSameDay(dateB, now);
                        if (aPast && !bPast) return 1;
                        if (!aPast && bPast) return -1;
                        return dateA.getTime() - dateB.getTime();
                      })
                      .map(booking => (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          canEdit={canEdit}
                          onEdit={() => { setEditingBooking(booking); setIsBookingFormOpen(true); }}
                        />
                      ))}
                  </div>
                </>
              ) : (
                <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-12 text-center text-zinc-500">
                  <p className="text-sm">No bookings added yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FINANCE TAB */}
        {activeTab === 'finance' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-lg font-bold text-white">Daily Expenses</h3>
              <div className="text-right">
                <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">Daily Total</div>
                <div className="text-xl font-bold text-white font-mono">
                  {trip?.currencies?.[0] || 'TWD'} {filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
                </div>
              </div>
            </div>

            {filteredExpenses.length > 0 ? (
              filteredExpenses.map(expense => (
                <div
                  key={expense.id}
                  onClick={() => { if (canEdit) { setEditingExpense(expense); setIsFinanceFormOpen(true); } }}
                  className={`bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg flex items-center justify-between transition-colors ${canEdit ? 'cursor-pointer hover:bg-zinc-800/50' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <DollarSign className="text-zinc-400" size={20} />
                    </div>
                    <div>
                      <h4 className="text-white font-medium">{expense.item_name}</h4>
                      <p className="text-xs text-zinc-500 mt-1 uppercase tracking-wider">Paid by {getUserNameById(expense.payer_id)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-white">{expense.amount.toLocaleString()}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{expense.currency}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
                <p>No expenses recorded for this day.</p>
              </div>
            )}

            {canEdit && (
              <button
                onClick={() => { setEditingExpense(null); setIsFinanceFormOpen(true); }}
                className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
              >
                <Plus size={20} /><span className="font-medium">Add Expense</span>
              </button>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && hasEditPermission && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-white mb-6">Trip Settings</h3>
              <TripSettingsForm
                trip={trip}
                onUpdate={refreshTripData}
                onDelete={async () => {
                  try {
                    await apiFetch(`/api/trips/${id}`, { method: 'DELETE' });
                    await db.trips.delete(Number(id));
                    navigate('/');
                  } catch (e) { alert('Delete failed'); }
                }}
                onClose={() => setActiveTab('itinerary')}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-around px-4 pt-2 z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
        style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
      >
        {[
          { tab: 'itinerary', icon: Map,     label: 'Itinerary' },
          { tab: 'info',      icon: Info,    label: 'Info' },
          { tab: 'finance',   icon: Wallet,  label: 'Finance' },
        ].map(({ tab, icon: Icon, label }) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={clsx(
              'flex flex-col items-center justify-center w-full h-14 gap-1 rounded-2xl transition-all duration-300',
              activeTab === tab ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            )}
          >
            <Icon size={activeTab === tab ? 24 : 22} className="transition-all duration-300" />
            <span className="text-[10px] font-bold tracking-wide">{label}</span>
          </button>
        ))}
        {hasEditPermission && (
          <button
            onClick={() => setActiveTab('settings')}
            className={clsx(
              'flex flex-col items-center justify-center w-full h-14 gap-1 rounded-2xl transition-all duration-300',
              activeTab === 'settings' ? 'text-orange-500 bg-orange-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            )}
          >
            <Settings size={activeTab === 'settings' ? 24 : 22} className="transition-all duration-300" />
            <span className="text-[10px] font-bold tracking-wide">Settings</span>
          </button>
        )}
      </div>

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
                  } catch (e) { alert('Failed to save booking'); }
                }}
                onCancel={() => { setIsBookingFormOpen(false); setEditingBooking(null); }}
              />
              {editingBooking && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <button
                    onClick={() => handleDeleteBooking(editingBooking.id)}
                    className="w-full py-3 text-red-500 bg-red-500/10 hover:bg-red-500/20 font-bold rounded-xl transition-colors"
                  >
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
                  method: 'PUT',
                  body: JSON.stringify({ ...editingItinerary, ...data })
                });
                setIsNextTransportFormOpen(false); setEditingItinerary(null); refreshTripData();
              } catch (e) { alert('Failed to save transport'); }
            }}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}