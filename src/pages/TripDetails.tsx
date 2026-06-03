import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { format, parseISO, addDays, differenceInDays, isSameDay, isPast, addMinutes } from 'date-fns';
import { Map, Info, Wallet, ArrowLeft, Calendar, Settings, Edit3, ChevronsUpDown, ChevronsDownUp, Unlock, Plus, DollarSign, Loader2, LockIcon, ImageIcon } from 'lucide-react';
import { Trip, Itinerary, Expense, User, Booking } from '../types';
import { clsx } from 'clsx';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { apiFetch } from '../utils/api';
import { FinanceForm } from '../components/FinanceForm';
import { NextTransportForm } from '../components/NextTransportForm';
import { ItineraryForm } from '../components/ItineraryForm';
import { TripSettingsForm } from '../components/TripSettingsForm';
import { WeatherWidget } from '../components/WeatherWidget';
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
  } catch (e) {
    return null;
  }
};

// ✅ 根據行程標題產生 Unsplash 關鍵字封面圖
// 優先使用用戶上傳的 cover_image_url；若無，則用標題作為 Unsplash 搜尋關鍵字
function getTripCoverImage(trip: any): string {
  if (trip?.cover_image_url && typeof trip.cover_image_url === 'string' && trip.cover_image_url.startsWith('http')) {
    return trip.cover_image_url;
  }
  const keyword = encodeURIComponent((trip?.title || 'travel').trim());
  return `https://source.unsplash.com/1920x1080/?${keyword},travel`;
}

export function TripDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAppStore();

  const { refreshTripData } = useTripData(id);

  const trip = useLiveQuery(() => db.trips.get(Number(id) || 0), [id]);
  const itineraries = useLiveQuery(() => db.itineraries.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const expenses = useLiveQuery(() => db.expenses.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const members = useLiveQuery(() => db.tripMembers.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const bookings = useLiveQuery(() => db.bookings.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];

  const [activeTab, setActiveTab] = useState<'itinerary' | 'info' | 'finance' | 'settings'>('itinerary');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [bookingFilter, setBookingFilter] = useState<string>('ALL');
  
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);

  // ✅ 封面圖預設縮起，節省行程空間
  const [isCoverVisible, setIsCoverVisible] = useState(false);

  const toggleExpandAll = () => {
    const nextState = !isAllExpanded;
    setIsAllExpanded(nextState);
    if (nextState) setExpandSignal(s => s + 1);
    else setCollapseSignal(s => s + 1);
  };

  useEffect(() => {
    refreshTripData();
  }, [refreshTripData]);

  // 💡 自動跳轉到「今天」的核心魔法邏輯
  useEffect(() => {
    if (trip?.start_date && trip?.end_date) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      if (todayStr >= trip.start_date && todayStr <= trip.end_date) {
        const todayParsed = safeParse(todayStr);
        if (todayParsed) {
          setSelectedDate(todayParsed);
          return;
        }
      }
      
      const parsedStart = safeParse(trip.start_date);
      if (parsedStart) setSelectedDate(parsedStart);
    }
  }, [trip?.start_date, trip?.end_date]);

  const [isFinanceFormOpen, setIsFinanceFormOpen] = useState(false);
  const [isItineraryFormOpen, setIsItineraryFormOpen] = useState(false);
  const [isNextTransportFormOpen, setIsNextTransportFormOpen] = useState(false);
  const [isBookingFormOpen, setIsBookingFormOpen] = useState(false);

  const [editingItinerary, setEditingItinerary] = useState<Itinerary | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  
  const [isEditMode, setIsEditMode] = useState(false);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    onConfirm: () => {}
  });

  const tripUsers = useLiveQuery(async () => {
    if (!id) return [];
    const tripMembersArr = await db.tripMembers.where('trip_id').equals(Number(id)).toArray();
    const userIds = tripMembersArr.map(m => m.user_id);
    return db.users.where('id').anyOf(userIds).toArray();
  }, [id]);

  const handleDeleteItinerary = async (itineraryId: number) => {
    setConfirmConfig({
      isOpen: true,
      title: '刪除活動',
      message: '您確定要刪除此活動嗎？此操作無法復原。',
      confirmText: '刪除活動',
      onConfirm: async () => {
        if (!id) return;
        try {
          const res = await apiFetch(`/api/trips/${id}/itineraries/${itineraryId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete itinerary');
          await db.itineraries.delete(itineraryId);
          setIsItineraryFormOpen(false);
          setEditingItinerary(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error(err);
          alert('Failed to delete activity');
        }
      }
    });
  };

  const handleDeleteBooking = async (bookingId: number) => {
    setConfirmConfig({
      isOpen: true,
      title: '刪除預訂',
      message: '您確定要刪除此預訂資訊嗎？相關的行程項目也會一併刪除。',
      confirmText: '刪除預訂',
      onConfirm: async () => {
        if (!id) return;
        try {
          const res = await apiFetch(`/api/trips/${id}/bookings/${bookingId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete booking');
          await db.bookings.delete(bookingId);
          
          const relatedItineraries = itineraries.filter(i => i.related_id === bookingId && (i.type === 'TRANSPORTATION' || i.type === 'ACCOMMODATION' || i.type === 'RENTAL'));
          if (relatedItineraries.length > 0) await db.itineraries.bulkDelete(relatedItineraries.map(i => i.id));
          
          setIsBookingFormOpen(false);
          setEditingBooking(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error(err);
          alert('Failed to delete booking');
        }
      }
    });
  };

  const isMember = user && (
    members.some(m => Number(m.user_id) === Number(user.id)) ||
    (trip?.members && Array.isArray(trip.members) && trip.members.some((m: any) => Number(m.user_id) === Number(user.id)))
  );
  
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const hasEditPermission = !!(isMember || isAdmin);
  const canEdit = hasEditPermission && isEditMode;

  const hasAccess = trip?.is_public === 1 || hasEditPermission;

  useEffect(() => {
    if (trip && !hasAccess) {
      navigate('/', { replace: true });
    }
  }, [trip, hasAccess, navigate]);

  const validTripStartDate = safeParse(trip?.start_date);
  const validTripEndDate = safeParse(trip?.end_date);
  const daysCount = (validTripStartDate && validTripEndDate) ? differenceInDays(validTripEndDate, validTripStartDate) + 1 : 0;
  const dates = Array.from({ length: daysCount }).map((_, i) => addDays(validTripStartDate || new Date(), i));

  // ✅ 改用 Unsplash，以標題作為關鍵字
  const tripCoverImageUrl = getTripCoverImage(trip);

  const filteredItineraries = useMemo(() => {
    if (!itineraries) return [];

    const prefWeight: Record<string, number> = {
      'anytime': 0,
      'morning': 1,
      'afternoon': 2,
      'evening': 3
    };

    return itineraries
      .filter(item => {
        try {
          const itemDate = typeof item.date === 'string' ? parseISO(item.date) : item.date;
          return isSameDay(itemDate, selectedDate || new Date());
        } catch (e) { return false; }
      })
      .sort((a, b) => {
        const hasTimeA = !!a.start_time && a.start_time.trim() !== '';
        const hasTimeB = !!b.start_time && b.start_time.trim() !== '';

        if (hasTimeA && !hasTimeB) return -1;
        if (!hasTimeA && hasTimeB) return 1;

        if (hasTimeA && hasTimeB) {
          return a.start_time.localeCompare(b.start_time);
        }

        const weightA = prefWeight[a.time_preference || 'anytime'] ?? 0;
        const weightB = prefWeight[b.time_preference || 'anytime'] ?? 0;

        if (weightA !== weightB) {
          return weightA - weightB;
        }

        return (a.id || 0) - (b.id || 0);
      });
  }, [itineraries, selectedDate]);

  const conflictedIdsInView = useMemo(() => {
    const conflicts = new Set<number>();
    if (!selectedDate) return conflicts;

    const items = filteredItineraries.map(item => ({
      ...item,
      isBooking: item.type !== 'GENERAL',
      times: getEffectiveTimes(item, selectedDate)
    }));

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        if (a.times.start < b.times.end && a.times.end > b.times.start) {
          if (a.isBooking && !b.isBooking) conflicts.add(b.id);
          else if (!a.isBooking && b.isBooking) conflicts.add(a.id);
          else { conflicts.add(a.id); conflicts.add(b.id); }
        }
      }
    }
    return conflicts;
  }, [filteredItineraries, selectedDate]);

  const checkAllConflicts = () => {
    const byDate: Record<string, typeof itineraries> = {};
    itineraries.forEach(item => {
      if (!byDate[item.date]) byDate[item.date] = [];
      byDate[item.date].push(item);
    });

    for (const dateStr in byDate) {
      const dateObj = parseISO(dateStr);
      const items = byDate[dateStr].map(item => ({
        ...item,
        isBooking: item.type !== 'GENERAL',
        times: getEffectiveTimes(item, dateObj)
      }));

      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (a.times.start < b.times.end && a.times.end > b.times.start) return true;
        }
      }
    }
    return false;
  };

  const handleToggleEditMode = () => {
    if (!hasEditPermission) {
      alert('您沒有編輯此行程的權限。');
      return;
    }
    if (isEditMode) {
      if (checkAllConflicts()) {
        setConfirmConfig({
          isOpen: true,
          title: '時間衝突警告',
          message: '目前行程中有卡片時間重疊（已標示紅框），建議您調整時間。確定要直接離開編輯模式嗎？',
          confirmText: '確定離開',
          cancelText: '繼續編輯',
          onConfirm: () => {
            setIsEditMode(false);
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          }
        });
      } else {
        setIsEditMode(false);
      }
    } else {
      setIsEditMode(true);
    }
  };

  const filteredExpenses = expenses.filter(e => {
    const parsed = safeParse(e.date);
    return parsed ? isSameDay(parsed, selectedDate || new Date()) : false;
  });

  const getUserNameById = (userId: number) => {
    const u = tripUsers?.find(u => u.id === userId);
    return u ? u.name : `User ${userId}`;
  };

  const availableBookingCategories = useMemo(() => {
    const cats = new Set(bookings.map(b => b.category));
    return ['ALL', ...Array.from(cats)];
  }, [bookings]);

  if (!trip || !hasAccess) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden overscroll-none">
      <div className="shrink-0 z-30 bg-black relative shadow-xl">

        {/* ✅ 固定 header bar：返回按鈕 + 封面圖 toggle + 鎖頭按鈕 */}
        <div
          className="flex items-center justify-between px-4 bg-black"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          {/* 返回按鈕 */}
          <button
            onClick={() => navigate('/')}
            className="p-2 bg-zinc-900/80 backdrop-blur-md rounded-full text-white hover:bg-zinc-800 transition-colors border border-white/10"
          >
            <ArrowLeft size={20} />
          </button>

          {/* 右側按鈕組 */}
          <div className="flex items-center gap-2">
            {/* ✅ 封面圖 toggle 按鈕 */}
            <button
              onClick={() => setIsCoverVisible(v => !v)}
              className={clsx(
                "p-2 backdrop-blur-md rounded-full transition-all border border-white/10 shadow-lg",
                isCoverVisible
                  ? "bg-orange-500 text-white"
                  : "bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800"
              )}
              title={isCoverVisible ? '隱藏封面圖' : '顯示封面圖'}
            >
              <ImageIcon size={20} />
            </button>

            {/* 鎖頭按鈕 */}
            {hasEditPermission && (
              <button
                onClick={handleToggleEditMode}
                className={clsx(
                  "p-2 backdrop-blur-md rounded-full transition-all border border-white/10 shadow-lg",
                  isEditMode
                    ? "bg-orange-500 text-white"
                    : "bg-zinc-900/80 text-white hover:bg-orange-500"
                )}
              >
                {isEditMode ? <Unlock size={20} /> : <Edit3 size={20} />}
              </button>
            )}
          </div>
        </div>

        {/* ✅ 封面圖：預設縮起，點擊 toggle 按鈕後展開，動畫過渡 */}
        <div
          className={clsx(
            "relative w-full overflow-hidden transition-all duration-300 ease-in-out",
            isCoverVisible ? "h-56 opacity-100" : "h-0 opacity-0"
          )}
        >
          <img src={tripCoverImageUrl} alt={trip.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/60 via-black/20 to-transparent pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none"></div>
        </div>

        {/* 行程標題 + 日期（永遠顯示，不隨封面圖隱藏） */}
        <div className="px-4 py-3 bg-black">
          <h1 className="text-2xl font-bold text-white leading-tight tracking-tight">{trip.title}</h1>
          <div className="flex items-center gap-2 mt-1 text-zinc-400 text-sm font-medium">
            <div className="flex items-center gap-1.5 bg-zinc-900/80 px-2 py-1 rounded-lg border border-zinc-800">
              <Calendar size={13} className="text-orange-500" />
              <span>{validTripStartDate ? format(validTripStartDate, 'MMM d') : ''} - {validTripEndDate ? format(validTripEndDate, 'MMM d, yyyy') : ''}</span>
            </div>
          </div>
        </div>

        {(activeTab === 'itinerary' || activeTab === 'finance') && (
          <div className="bg-black/95 backdrop-blur-xl border-b border-zinc-800 py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="flex overflow-x-auto gap-3 no-scrollbar pb-1 flex-1">
                {dates.map((date, index) => {
                  const isActive = isSameDay(date, selectedDate || new Date());
                  return (
                    <button 
                      key={index} 
                      onClick={() => setSelectedDate(date)} 
                      className={clsx(
                        "flex flex-col items-center justify-center min-w-[56px] h-16 rounded-xl transition-all shrink-0", 
                        isActive ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20 scale-105" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800"
                      )}
                    >
                      <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">{date instanceof Date && !isNaN(date.getTime()) ? format(date, 'EEE') : '---'}</span>
                      <span className="text-lg font-bold mt-0.5">{date instanceof Date && !isNaN(date.getTime()) ? format(date, 'd') : '--'}</span>
                    </button>
                  );
                })}
              </div>
              <button 
                onClick={toggleExpandAll} 
                className={clsx(
                  "shrink-0 flex flex-col items-center justify-center w-12 h-16 rounded-2xl transition-all border", 
                  isAllExpanded ? "bg-gradient-to-b from-orange-500 to-orange-600 border-orange-400/50 text-white shadow-[0_4px_20px_rgba(249,115,22,0.4)]" : "bg-zinc-900/80 border-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-lg backdrop-blur-sm"
                )}
              >
                {isAllExpanded ? <ChevronsDownUp size={18} strokeWidth={2.5} /> : <ChevronsUpDown size={18} strokeWidth={2.5} />}
                <span className="text-[8px] font-black uppercase tracking-widest mt-1 opacity-80">
                  {isAllExpanded ? 'Collapse' : 'Expand'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-32 custom-scrollbar overscroll-none">
        {/* -------------------- ITINERARY TAB -------------------- */}
        {activeTab === 'itinerary' && (
          <div className="space-y-6">
            {id && <WeatherWidget tripId={Number(id)} date={selectedDate} />}

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
                  
                  const booking = (item.type === 'ACCOMMODATION' || item.type === 'RENTAL') && item.related_id ? bookings.find(b => b.id === item.related_id) : undefined;
                  
                  return (
                    <div key={`itinerary-${item.id}`} className="space-y-2">
                      <ItineraryCard 
                        item={item} 
                        canEdit={canEdit} 
                        isConflicted={conflictedIdsInView.has(item.id)} 
                        onEdit={() => { setEditingItinerary(item); setIsItineraryFormOpen(true); }} 
                        selectedDate={selectedDate || new Date()} 
                        showNextTransport={true}
                        onEditNextTransport={() => { setEditingItinerary(item); setIsNextTransportFormOpen(true); }} 
                        booking={booking} 
                        expandSignal={expandSignal} 
                        collapseSignal={collapseSignal} 
                      />
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl"><p>No activities for this day.</p></div>
              )}
              
              {canEdit && (
                <button onClick={() => { setEditingItinerary(null); setIsItineraryFormOpen(true); }} className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all">
                  <Plus size={20} /><span className="font-medium">Add Activity</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* -------------------- INFO / BOOKINGS TAB -------------------- */}
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
                  <button onClick={() => { setEditingBooking(null); setIsBookingFormOpen(true); }} className="p-2 bg-orange-500/10 text-orange-500 rounded-full hover:bg-orange-500/20 transition-colors">
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
                            "px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors border",
                            bookingFilter === cat ? "bg-orange-500 text-white border-orange-500" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
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
                        <BookingCard key={booking.id} booking={booking} canEdit={canEdit} onEdit={() => { setEditingBooking(booking); setIsBookingFormOpen(true); }} />
                      ))}
                  </div>
                </>
              ) : (
                <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-12 text-center text-zinc-500">
                  <div className="mb-4 flex justify-center"><Info size={32} className="opacity-20" /></div>
                  <p className="text-sm">No bookings added yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -------------------- FINANCE TAB -------------------- */}
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
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0"><DollarSign className="text-zinc-400" size={20} /></div>
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
              <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl"><p>No expenses recorded for this day.</p></div>
            )}

            {canEdit && (
              <button onClick={() => { setEditingExpense(null); setIsFinanceFormOpen(true); }} className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all">
                <Plus size={20} /><span className="font-medium">Add Expense</span>
              </button>
            )}
          </div>
        )}

        {/* -------------------- SETTINGS TAB -------------------- */}
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
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-around px-4 pt-2 z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]" style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}>
        <button onClick={() => setActiveTab('itinerary')} className={clsx("flex flex-col items-center justify-center w-full h-14 gap-1 rounded-2xl transition-all duration-300", activeTab === 'itinerary' ? "text-orange-500 bg-orange-500/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50")}>
          <Map size={activeTab === 'itinerary' ? 24 : 22} className="transition-all duration-300" />
          <span className="text-[10px] font-bold tracking-wide">Itinerary</span>
        </button>
        <button onClick={() => setActiveTab('info')} className={clsx("flex flex-col items-center justify-center w-full h-14 gap-1 rounded-2xl transition-all duration-300", activeTab === 'info' ? "text-orange-500 bg-orange-500/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50")}>
          <Info size={activeTab === 'info' ? 24 : 22} className="transition-all duration-300" />
          <span className="text-[10px] font-bold tracking-wide">Info</span>
        </button>
        <button onClick={() => setActiveTab('finance')} className={clsx("flex flex-col items-center justify-center w-full h-14 gap-1 rounded-2xl transition-all duration-300", activeTab === 'finance' ? "text-orange-500 bg-orange-500/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50")}>
          <Wallet size={activeTab === 'finance' ? 24 : 22} className="transition-all duration-300" />
          <span className="text-[10px] font-bold tracking-wide">Finance</span>
        </button>
        {hasEditPermission && (
          <button onClick={() => setActiveTab('settings')} className={clsx("flex flex-col items-center justify-center w-full h-14 gap-1 rounded-2xl transition-all duration-300", activeTab === 'settings' ? "text-orange-500 bg-orange-500/10" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50")}>
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
                tripId={id!} 
                defaultDate={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined} 
                currencies={trip.currencies ? (typeof trip.currencies === 'string' ? JSON.parse(trip.currencies) : trip.currencies) : ['TWD']} 
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
                    setIsBookingFormOpen(false);
                    setEditingBooking(null);
                    refreshTripData();
                  } catch (e) { alert('Failed to save booking'); }
                }}
                onCancel={() => { setIsBookingFormOpen(false); setEditingBooking(null); }} 
              />
              {editingBooking && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <button onClick={() => handleDeleteBooking(editingBooking.id)} className="w-full py-3 text-red-500 bg-red-500/10 hover:bg-red-500/20 font-bold rounded-xl transition-colors">
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
            nextItinerary={filteredItineraries[filteredItineraries.findIndex(i => i.id === editingItinerary.id) + 1]}
            onSave={async (data) => {
              if (!id) return;
              try {
                await apiFetch(`/api/trips/${id}/itineraries/${editingItinerary.id}`, { method: 'PUT', body: JSON.stringify({ ...editingItinerary, ...data }) });
                setIsNextTransportFormOpen(false);
                setEditingItinerary(null);
                refreshTripData();
              } catch (e) { alert('Failed to save transport info'); }
            }} 
          />
        )}
      </AnimatePresence>

      <ConfirmDialog {...confirmConfig} onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} />
    </div>
  );
}