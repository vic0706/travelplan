import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { format, parseISO, addDays, differenceInDays, isSameDay, isPast, addMinutes } from 'date-fns';
import { MapPin, Clock, Plus, Navigation, DollarSign, Plane, Bed, Map, Info, Wallet, ArrowLeft, Calendar, X, Settings, Edit3, ChevronDown, ChevronUp, Image as ImageIcon, Lock, Unlock, Trash2, Train, Ship, Bus, Car, Footprints } from 'lucide-react';
import { Trip, Itinerary, Expense, User, Booking, BookingCategory } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { clsx } from 'clsx';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getApiUrl, apiFetch } from '../utils/api';
import { FinanceForm } from '../components/FinanceForm';
import { NextTransportForm } from '../components/NextTransportForm';
import { ItineraryForm } from '../components/ItineraryForm';
import { TripSettingsForm } from '../components/TripSettingsForm';
import { WeatherWidget } from '../components/WeatherWidget';
import { BookingForm } from '../components/BookingForm';
import { FinanceOverview } from '../components/FinanceOverview';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';
import { DynamicIcon } from '../components/DynamicIcon';

// 實用時間解析與計算工具
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

function BookingCard({ booking, canEdit, onEdit }: { booking: Booking; canEdit: boolean; onEdit: () => void; }) {
  const startDate = parseISO(`${booking.start_date}T${booking.start_time}`);
  const endDate = parseISO(`${booking.end_date}T${booking.end_time}`);
  const isValidStart = !isNaN(startDate.getTime());
  const isValidEnd = !isNaN(endDate.getTime());
  const isToday = isValidStart && isSameDay(startDate, new Date());
  const isPastItem = isValidStart && isPast(startDate) && !isToday;

  const getIcon = () => {
    switch (booking.category) {
      case 'FLIGHT': return Plane;
      case 'TRAIN': return Train;
      case 'FERRY': return Ship;
      case 'RENTAL': return Car;
      case 'PRIVATE_TRANSFER': return Car;
      case 'HOTEL': return Bed;
      default: return Info;
    }
  };

  const Icon = getIcon();

  return (
    <div 
      onClick={() => canEdit && onEdit()}
      className={clsx(
        "bg-zinc-900 border border-zinc-800 rounded-3xl p-5 transition-all group relative overflow-hidden",
        canEdit && "hover:border-orange-500/50 cursor-pointer active:scale-[0.98]",
        isPastItem && "opacity-60 grayscale-[0.5]"
      )}
    >
      <div className="flex gap-4">
        {booking.image_url && booking.category !== 'HOTEL' && (
          <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-zinc-800">
            <img src={booking.image_url} alt={booking.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-zinc-800 text-orange-500"><Icon size={14} /></div>
            <h4 className="font-bold text-white truncate">{booking.category === 'RENTAL' ? `${booking.provider || ''} ${booking.title}` : booking.title}</h4>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
              <Calendar size={12} />
              <span>{isValidStart ? format(startDate, 'MMM d') : booking.start_date} {booking.start_time}</span>
              {isValidEnd && <><span className="mx-1">→</span><span>{format(endDate, 'MMM d')} {booking.end_time}</span></>}
            </div>
            {booking.start_location && (
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs truncate">
                <MapPin size={12} />
                <span>
                  {booking.start_location}
                  {(() => {
                     try { return JSON.parse(booking.details as string).dep_terminal ? ` (T${JSON.parse(booking.details as string).dep_terminal})` : ''; }
                     catch(e) { return (booking.details as any)?.dep_terminal ? ` (T${(booking.details as any).dep_terminal})` : ''; }
                  })()}
                </span>
                {booking.end_location && (
                  <><span className="mx-1">→</span><span>
                    {booking.end_location}
                    {(() => {
                       try { return JSON.parse(booking.details as string).arr_terminal ? ` (T${JSON.parse(booking.details as string).arr_terminal})` : ''; }
                       catch(e) { return (booking.details as any)?.arr_terminal ? ` (T${(booking.details as any).arr_terminal})` : ''; }
                    })()}
                  </span></>
                )}
              </div>
            )}
            {booking.provider && booking.category !== 'RENTAL' && (
              <div className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">{booking.provider} {booking.order_id && `• ${booking.order_id}`}</div>
            )}
            {booking.notes && <div className="text-xs text-zinc-500 italic mt-1 line-clamp-2">{booking.notes}</div>}
          </div>
        </div>
        {canEdit && <div className="p-2 text-zinc-600 group-hover:text-orange-500 transition-colors"><Edit3 size={16} /></div>}
      </div>
    </div>
  );
}

function TransportationCard({ item, booking, canEdit, isConflicted, onEdit, showNextTransport, onEditNextTransport }: { 
  item?: Itinerary; booking?: Booking; canEdit: boolean; isConflicted?: boolean; onEdit: () => void; showNextTransport?: boolean; onEditNextTransport?: () => void; 
}) {
  const data = booking;
  if (!data) return null;

  const dep_date = data.start_date;
  const dep_time = data.start_time;
  const arr_date = data.end_date;
  const arr_time = data.end_time;
  const type = data.category;
  const provider = data.provider;
  const title = data.title;
  const dep_station = data.start_location;
  const arr_station = data.end_location;
  const detailsObj = typeof data.details === 'string' ? (() => { try { return JSON.parse(data.details); } catch (e) { return {}; } })() : data.details || {};
  const dep_terminal = detailsObj.dep_terminal;
  const arr_terminal = detailsObj.arr_terminal;
  const dep_buffer = detailsObj.dep_buffer;
  const arr_buffer = detailsObj.arr_buffer;

  const depDate = parseISO(`${dep_date}T${dep_time}`);
  const arrDate = parseISO(`${arr_date}T${arr_time}`);
  
  const isValidDep = !isNaN(depDate.getTime());
  const isValidArr = !isNaN(arrDate.getTime());
  const isCrossDay = isValidDep && isValidArr && !isSameDay(depDate, arrDate);
  const isToday = isValidDep && isSameDay(depDate, new Date());
  const isPastItem = isValidDep && isPast(depDate) && !isToday;
  
  const [isExpanded, setIsExpanded] = useState(!isPastItem);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => { setIsExpanded(!isPastItem); }, [isPastItem]);

  const getIcon = () => {
    switch (type) {
      case 'TRAIN': return Train;
      case 'FERRY': return Ship;
      case 'RENTAL': return Car;
      case 'PRIVATE_TRANSFER': return Car;
      default: return Plane;
    }
  };
  const Icon = getIcon();

  const getLabels = () => {
    switch (type) {
      case 'FLIGHT': return { station: 'Airport', terminal: 'Terminal' };
      case 'TRAIN': return { station: 'Station', terminal: 'Platform' };
      case 'FERRY': return { station: 'Port', terminal: 'Pier' };
      case 'RENTAL': return { station: 'Location', terminal: 'Counter' };
      case 'PRIVATE_TRANSFER': return { station: 'Location', terminal: 'Point' };
      default: return { station: 'Location', terminal: 'Point' };
    }
  };
  const labels = getLabels();

  if (item) {
    const depDateTime = parseISO(`${dep_date}T${dep_time}`);
    const checkinBuffer = dep_buffer || 120;
    const checkinDate = new Date(depDateTime.getTime() - checkinBuffer * 60000);
    const checkinTimeStr = format(checkinDate, 'HH:mm');

    const arrDateTime = parseISO(`${arr_date}T${arr_time}`);
    const exitBuffer = arr_buffer || 60;
    const exitDate = new Date(arrDateTime.getTime() + exitBuffer * 60000);
    const exitTimeStr = format(exitDate, 'HH:mm');

    return (
      <div 
        className={clsx(
          "bg-zinc-900 rounded-3xl overflow-hidden shadow-lg group relative transition-all",
          isConflicted ? "border-red-500 ring-2 ring-red-500" : "border border-zinc-800",
          canEdit && !isConflicted ? "cursor-pointer hover:border-orange-500/50" : canEdit && isConflicted ? "cursor-pointer" : "cursor-pointer hover:border-zinc-700",
          isPastItem && !isExpanded && "opacity-50 grayscale hover:opacity-100 hover:grayscale-0",
          isExpanded ? "h-auto min-h-[180px]" : "h-auto"
        )}
        onClick={() => canEdit ? onEdit() : setIsExpanded(!isExpanded)}
      >
        <div className="p-5 flex items-start justify-between gap-4 bg-zinc-900 relative z-20">
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="flex items-center gap-2 text-zinc-400">
              <div className={clsx("w-1.5 h-1.5 rounded-full", isPastItem ? "bg-zinc-600" : "bg-orange-500")} />
              <span className="font-mono text-sm font-medium tracking-wide">{item.start_time} - {item.end_time}</span>
            </div>
            <h3 className="text-xl font-bold text-white leading-tight flex items-center gap-2">
              <Icon size={20} className={isPastItem ? "text-zinc-500" : "text-orange-500"} />
              <span>{provider} {title}</span>
            </h3>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-col items-center bg-zinc-800/50 rounded-2xl border border-zinc-700/50 overflow-hidden shadow-sm backdrop-blur-sm">
              <a 
                href={dep_station && dep_station.startsWith('http') ? dep_station : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dep_station || title)}`}
                target="_blank" rel="noopener noreferrer"
                className="p-2.5 text-zinc-400 hover:text-orange-500 hover:bg-zinc-700/50 transition-colors flex items-center justify-center w-10 h-10"
                onClick={(e) => e.stopPropagation()} title="View on Map"
              >
                 <Map size={18} />
              </a>

              {showNextTransport && (canEdit || !!item.next_transport_mode) && (
                <>
                  <div className="w-6 h-px bg-zinc-700/50" />
                  <button
                    onClick={(e) => { e.stopPropagation(); if (canEdit) onEditNextTransport?.(); }}
                    disabled={!canEdit}
                    className={clsx(
                      "p-2 flex flex-col items-center justify-center gap-0.5 w-10 transition-colors",
                      canEdit ? "hover:bg-zinc-700/50 cursor-pointer" : "cursor-default",
                      item.next_transport_mode ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {item.next_transport_mode ? (
                      <>
                        {item.next_transport_mode === 'WALKING' && <Footprints size={16} />}
                        {(item.next_transport_mode === 'TRANSIT' || item.next_transport_mode === 'BUS') && <Bus size={16} />}
                        {item.next_transport_mode === 'TRAIN' && <Train size={16} />}
                        {item.next_transport_mode === 'SHIP' && <Ship size={16} />}
                        {(item.next_transport_mode === 'DRIVING' || item.next_transport_mode === 'TAXI') && <Car size={16} />}
                        {(item.next_transport_time || item.next_transport_auto_time) && (
                          <span className="text-[9px] font-mono font-bold leading-none mt-0.5">{item.next_transport_time ? item.next_transport_time.replace(' min', 'm') : 'Auto'}</span>
                        )}
                      </>
                    ) : <Plus size={18} />}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className={clsx("relative transition-all duration-300 ease-in-out overflow-hidden", isExpanded ? "h-auto opacity-100" : "h-0 opacity-0")}>
           <div className="px-5 pb-5 relative">
              <div className="relative"> 
                  {!showDetails ? (
                    <div className="relative">
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                            <div className="flex flex-col">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Dep</div>
                                <div className="text-2xl font-bold text-white leading-none tracking-tight">{dep_time}</div>
                                <div className="text-sm font-medium text-zinc-300 mt-1 truncate">{dep_station}</div>
                                {dep_terminal && <div className="text-[10px] text-orange-500 mt-0.5">{labels.terminal} {dep_terminal}</div>}
                            </div>
                            <div className="flex flex-col items-center justify-center pt-2">
                                <div className="w-8 h-px bg-zinc-700 relative"><div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 bg-zinc-500 rounded-full"></div></div>
                                {isCrossDay && <span className="text-[9px] text-orange-500 mt-1">+1d</span>}
                            </div>
                            <div className="flex flex-col text-right">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Arr</div>
                                <div className="text-2xl font-bold text-white leading-none tracking-tight">{arr_time}</div>
                                <div className="text-sm font-medium text-zinc-300 mt-1 truncate">{arr_station}</div>
                                {arr_terminal && <div className="text-[10px] text-orange-500 mt-0.5">{labels.terminal} {arr_terminal}</div>}
                            </div>
                        </div>
                    </div>
                  ) : (
                     <div className="relative bg-zinc-950 rounded-2xl p-4 border border-zinc-800 shadow-xl mt-2">
                         <div className="relative pt-2 pb-4 mt-2 px-2">
                           <div className="absolute top-[22px] left-2 right-2 h-0.5 bg-zinc-800"></div>
                           <div className="flex justify-between relative">
                             <div className="flex flex-col items-center gap-1 relative z-10 group/point">
                               <div className="text-[10px] font-mono text-zinc-400 mb-1">{checkinTimeStr}</div>
                               <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 border-2 border-zinc-600 group-hover/point:border-orange-500 transition-colors"></div>
                               <div className="text-[9px] font-mono text-zinc-500 font-medium mt-1">Check-in</div>
                             </div>
                             <div className="flex flex-col items-center gap-1 relative z-10 group/point">
                               <div className="text-[10px] font-mono text-white font-bold mb-1">{dep_time}</div>
                               <div className="w-2.5 h-2.5 rounded-full bg-zinc-600 border-2 border-zinc-500 group-hover/point:border-orange-500 transition-colors"></div>
                               <div className="text-[9px] font-mono text-zinc-300 font-medium mt-1">Dep</div>
                             </div>
                             <div className="flex flex-col items-center gap-1 relative z-10 group/point">
                               <div className="text-[10px] font-mono text-white font-bold mb-1">{arr_time}</div>
                               <div className="w-2.5 h-2.5 rounded-full bg-zinc-600 border-2 border-zinc-500 group-hover/point:border-orange-500 transition-colors"></div>
                               <div className="text-[9px] font-mono text-zinc-300 font-medium mt-1">Arr</div>
                             </div>
                             <div className="flex flex-col items-center gap-1 relative z-10 group/point">
                               <div className="text-[10px] font-mono text-zinc-400 mb-1">{exitTimeStr}</div>
                               <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 border-2 border-zinc-600 group-hover/point:border-orange-500 transition-colors"></div>
                               <div className="text-[9px] font-mono text-zinc-500 font-medium mt-1">Exit</div>
                             </div>
                           </div>
                         </div>
                         {data.notes && <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-400 italic text-center leading-relaxed">{data.notes}</div>}
                     </div>
                  )}
                  <div className="flex justify-center mt-4">
                      <div className="flex items-center justify-center w-10 h-6 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white cursor-pointer transition-colors border border-zinc-700/50" onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}>
                         {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                  </div>
              </div>
           </div>
        </div>
      </div>
    );
  }
  return null;
}

function SubItemRow({ sub, itineraryImageUrl, isLast, hasMore }: { sub: any; itineraryImageUrl: string | null; isLast: boolean; hasMore: boolean }) {
  const [showNotes, setShowNotes] = useState(false);
  const rowRef = React.useRef<HTMLDivElement>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowNotes(!showNotes);
    if (!showNotes && rowRef.current) setTimeout(() => rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  return (
    <div ref={rowRef} className={clsx("flex flex-col gap-1 text-sm p-3 rounded-2xl border relative overflow-hidden group/sub transition-all", itineraryImageUrl ? "text-white/90 bg-black/40 border-white/10" : "text-zinc-400 bg-zinc-900/50 border-zinc-800/50")}>
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-zinc-700 group-hover/sub:bg-orange-500 transition-colors"></div>
      <div className="flex items-center justify-between gap-3 pl-2">
        <div className="text-xs font-mono text-zinc-400 whitespace-nowrap min-w-[80px]">{sub.start_time} - {sub.end_time}</div>
        <div className={clsx("font-semibold flex-1 truncate", itineraryImageUrl ? "text-white" : "text-zinc-100")}>{sub.title || sub.text}</div>
        <div className="flex items-center gap-2 shrink-0">
          {sub.address && <a href={sub.address.startsWith('http') ? sub.address : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sub.address)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={clsx("p-1.5 rounded-full transition-colors", itineraryImageUrl ? "text-white/70 hover:text-white hover:bg-white/10" : "text-zinc-500 hover:text-orange-500 hover:bg-zinc-800")}><Map size={14} /></a>}
          {(sub.notes || (sub.tags && sub.tags.length > 0)) && <button onClick={handleToggle} className={clsx("p-1.5 rounded-full transition-colors", itineraryImageUrl ? "text-white/70 hover:text-white hover:bg-white/10" : "text-zinc-500 hover:text-white hover:bg-zinc-800")}><ChevronDown size={14} className={clsx("transition-transform", showNotes ? "rotate-180" : "")} /></button>}
        </div>
      </div>
      <AnimatePresence>
        {showNotes && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pl-2">
            {sub.tags && Array.isArray(sub.tags) && sub.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-2 mb-1">{sub.tags.map((tag: string, idx: number) => <span key={idx} className={clsx("text-[10px] px-1.5 py-0.5 rounded border", itineraryImageUrl ? "text-white/80 border-white/20 bg-white/5" : "text-zinc-400 border-zinc-700 bg-zinc-800")}>{tag}</span>)}</div>}
            {sub.notes && <div className={clsx("text-xs mt-1 italic leading-relaxed p-2 rounded-lg", itineraryImageUrl ? "bg-white/10 text-white/80" : "bg-zinc-800/50 text-zinc-400")}>{sub.notes}</div>}
            {hasMore && <div className="text-[9px] text-zinc-500 text-center mt-2 pb-1 animate-pulse">▼ More sub-activities below</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ItineraryCard({ item, canEdit, isConflicted, onEdit, selectedDate, showNextTransport, onEditNextTransport, booking }: { 
  item: Itinerary; canEdit: boolean; isConflicted?: boolean; onEdit: () => void; selectedDate: Date; showNextTransport?: boolean; onEditNextTransport?: () => void; booking?: Booking;
}) {
  const timeString = item.end_time || item.start_time || '23:59';
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const itemDateTime = parseISO(`${dateStr}T${timeString}`);
  const isPastItem = !isNaN(itemDateTime.getTime()) && isPast(itemDateTime);

  const subItems = item.sub_items ? JSON.parse(item.sub_items) : [];
  const hasNotes = !!item.notes;
  const hasTags = Array.isArray(item.tags) && item.tags.length > 0;
  const hasSubItems = subItems.length > 0;
  const itineraryImageUrl = item.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('http') ? item.image_url : null;

  const hasExpandableContent = hasNotes || hasTags || hasSubItems || !!itineraryImageUrl;
  const [isExpanded, setIsExpanded] = useState(!isPastItem && hasExpandableContent);
  const [showDetails, setShowDetails] = useState(false);
  
  useEffect(() => { setIsExpanded(!isPastItem && hasExpandableContent); }, [isPastItem, hasExpandableContent]);

  return (
    <div 
      className={clsx(
        "bg-zinc-900 rounded-3xl overflow-hidden shadow-lg group relative transition-all",
        isConflicted ? "border-red-500 ring-2 ring-red-500" : "border border-zinc-800",
        canEdit && !isConflicted ? "cursor-pointer hover:border-orange-500/50" : canEdit && isConflicted ? "cursor-pointer" : "cursor-pointer hover:border-zinc-700",
        isPastItem && !isExpanded && "opacity-50 grayscale-[0.5] hover:opacity-100 hover:grayscale-0"
      )}
      onClick={() => canEdit ? onEdit() : (hasExpandableContent && setIsExpanded(!isExpanded))}
    >
      <div className="p-5 flex items-start justify-between gap-4 bg-zinc-900 relative z-20">
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="flex items-center gap-2 text-zinc-400">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span className="font-mono text-sm font-medium tracking-wide">{item.start_time} - {item.start_time === item.end_time ? 'Auto' : item.end_time}</span>
          </div>
          <h3 className="text-xl font-bold text-white leading-tight flex items-center">
            {item.type === 'ACCOMMODATION' && <Bed className="text-orange-500 mr-2 shrink-0" size={20} />}
            {item.type === 'RENTAL' && <Car className="text-orange-500 mr-2 shrink-0" size={20} />}
            {item.icon && <DynamicIcon name={item.icon} className="text-orange-500 mr-2 shrink-0" size={20} />}
            {item.title}
          </h3>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-col items-center bg-zinc-800/50 rounded-2xl border border-zinc-700/50 overflow-hidden shadow-sm backdrop-blur-sm">
            <a 
              href={item.address && item.address.startsWith('http') ? item.address : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.title)}`}
              target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="p-2.5 text-zinc-400 hover:text-orange-500 hover:bg-zinc-700/50 transition-colors flex items-center justify-center w-10 h-10" title="View on Map"
            >
              <Map size={18} />
            </a>

            {showNextTransport && (canEdit || item.next_transport_mode) && (
              <>
                <div className="w-6 h-px bg-zinc-700/50" />
                <button
                  onClick={(e) => { e.stopPropagation(); if (canEdit) onEditNextTransport?.(); }}
                  disabled={!canEdit}
                  className={clsx("p-2 flex flex-col items-center justify-center gap-0.5 w-10 transition-colors", canEdit ? "hover:bg-zinc-700/50 cursor-pointer" : "cursor-default", item.next_transport_mode ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300")}
                >
                  {item.next_transport_mode ? (
                    <>
                      {item.next_transport_mode === 'WALKING' && <Footprints size={16} />}
                      {(item.next_transport_mode === 'TRANSIT' || item.next_transport_mode === 'BUS') && <Bus size={16} />}
                      {item.next_transport_mode === 'TRAIN' && <Train size={16} />}
                      {item.next_transport_mode === 'SHIP' && <Ship size={16} />}
                      {(item.next_transport_mode === 'DRIVING' || item.next_transport_mode === 'TAXI') && <Car size={16} />}
                      {(item.next_transport_time || item.next_transport_auto_time) && <span className="text-[9px] font-mono font-bold leading-none mt-0.5">{item.next_transport_time ? item.next_transport_time.replace(' min', 'm') : (item.next_transport_auto_time || 'Auto')}</span>}
                    </>
                  ) : <Plus size={18} />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={clsx("relative transition-all duration-300 ease-in-out overflow-hidden", isExpanded ? "h-[200px]" : "h-0")}>
        {itineraryImageUrl ? <img src={itineraryImageUrl} alt={item.title} className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="absolute inset-0 bg-gradient-to-br from-orange-900/30 via-zinc-900 to-zinc-900 border-t border-orange-500/10" />}
        <div className={clsx("absolute inset-0 transition-colors duration-300", itineraryImageUrl ? (showDetails ? "bg-black/80 backdrop-blur-sm" : "bg-gradient-to-b from-zinc-900/40 via-transparent to-black/60") : "bg-transparent")} />
        <div className="absolute inset-0 p-5 flex flex-col z-10">
          <div className="flex items-start justify-between gap-4 shrink-0">
            <div className="flex flex-wrap gap-2 flex-1">
              {Array.isArray(item.tags) && item.tags.map((tag: string) => (
                <span key={tag} className={clsx("text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shadow-sm backdrop-blur-md", itineraryImageUrl ? "text-white bg-black/40 border-white/20" : "text-zinc-300 bg-zinc-900/50 border-zinc-700/50")}>{tag}</span>
              ))}
            </div>
          </div>
          <AnimatePresence>
            {showDetails && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex-1 overflow-y-auto custom-scrollbar mt-4 pr-2" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-4 pb-2">
                  {item.notes && <p className={clsx("text-sm leading-relaxed p-4 rounded-2xl border", itineraryImageUrl ? "text-white/90 bg-black/40 border-white/10" : "text-zinc-300 bg-zinc-900/50 border-zinc-700/30")}>{item.notes}</p>}
                  {subItems.length > 0 && <div className="space-y-3">{subItems.map((sub: any, idx: number) => <SubItemRow key={sub.id || idx} sub={sub} itineraryImageUrl={itineraryImageUrl} isLast={idx === subItems.length - 1} hasMore={idx < subItems.length - 1} />)}</div>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {(hasNotes || hasSubItems) && !canEdit && (
            <div className="flex justify-center mt-auto pt-2 shrink-0">
              <div className={clsx("flex items-center justify-center w-10 h-6 rounded-full border backdrop-blur-md transition-colors duration-300 cursor-pointer hover:bg-white/10", itineraryImageUrl ? "bg-black/40 border-white/20 text-white" : "bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:text-white")} onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}>
                {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TripDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, _hasHydrated, token } = useAppStore();
  
  const trip = useLiveQuery(() => db.trips.get(Number(id) || 0), [id]);
  const itineraries = useLiveQuery(() => db.itineraries.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const expenses = useLiveQuery(() => db.expenses.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const members = useLiveQuery(() => db.tripMembers.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const bookings = useLiveQuery(() => db.bookings.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];

  const [activeTab, setActiveTab] = useState<'itinerary' | 'info' | 'finance' | 'settings'>('itinerary');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bookingFilter, setBookingFilter] = useState<string>('ALL');
  
  useEffect(() => { setSelectedDate(new Date()); }, []);
  
  const [isFinanceFormOpen, setIsFinanceFormOpen] = useState(false);
  const [isItineraryFormOpen, setIsItineraryFormOpen] = useState(false);
  const [isNextTransportFormOpen, setIsNextTransportFormOpen] = useState(false);
  const [isBookingFormOpen, setIsBookingFormOpen] = useState(false);
  
  const [editingItinerary, setEditingItinerary] = useState<Itinerary | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; title: string; message: string; confirmText?: string; cancelText?: string; onConfirm: () => void; }>({ 
    isOpen: false, title: '', message: '', confirmText: 'Confirm', onConfirm: () => {} 
  });

  const safeParse = (dateStr: any) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try { const parsed = parseISO(dateStr); return isNaN(parsed.getTime()) ? null : parsed; } catch (e) { return null; }
  };

  useEffect(() => {
    if (!id || !navigator.onLine || !_hasHydrated) return;

    const fetchTripDetails = async () => {
      setIsLoading(true);
      try {
        const tripRes = await apiFetch(`/api/trips/${id}`);
        if (!tripRes.ok) throw new Error('Trip fetch failed');
        const tripData = await tripRes.json() as Trip;
        
        const tripEndDate = safeParse(tripData.end_date);
        const isPastTrip = tripEndDate && isPast(tripEndDate) && !isSameDay(tripEndDate, new Date());
        const shouldDeepCache = user?.role !== 'Guest' && !isPastTrip;

        await db.trips.put({ ...tripData, last_accessed: Date.now(), is_fully_synced: shouldDeepCache });

        const [itinerariesRes, expensesRes, membersRes, bookingsRes] = await Promise.all([
          apiFetch(`/api/trips/${id}/itineraries`),
          apiFetch(`/api/trips/${id}/expenses`),
          apiFetch(`/api/trips/${id}/members`),
          apiFetch(`/api/trips/${id}/bookings`)
        ]);

        if (itinerariesRes.ok) {
          const data = await itinerariesRes.json() as Itinerary[];
          const existingIds = await db.itineraries.where('trip_id').equals(Number(id)).primaryKeys();
          const incomingIds = data.map(i => i.id);
          const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid as number));
          await db.transaction('rw', db.itineraries, async () => {
            if (idsToDelete.length > 0) await db.itineraries.bulkDelete(idsToDelete as number[]);
            await db.itineraries.bulkPut(data);
          });
        }

        if (expensesRes.ok) {
          const data = await expensesRes.json() as Expense[];
          const existingIds = await db.expenses.where('trip_id').equals(Number(id)).primaryKeys();
          const incomingIds = data.map(e => e.id);
          const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid as number));
          await db.transaction('rw', db.expenses, async () => {
            if (idsToDelete.length > 0) await db.expenses.bulkDelete(idsToDelete as number[]);
            await db.expenses.bulkPut(data);
          });
        }

        if (membersRes.ok) {
          const data = await membersRes.json() as User[];
          await db.users.bulkPut(data.map((m) => ({ id: m.id, name: m.name, role: m.role, avatar_url: m.avatar_url || '', allow_login: 1 })));
          const existingMembers = await db.tripMembers.where('trip_id').equals(Number(id)).toArray();
          const incomingMemberIds = data.map(m => m.id);
          const membersToDelete = existingMembers.filter(m => !incomingMemberIds.includes(m.user_id));
          await db.transaction('rw', db.tripMembers, async () => {
            for (const m of membersToDelete) await db.tripMembers.where({ trip_id: Number(id), user_id: m.user_id }).delete();
            await db.tripMembers.bulkPut(data.map((m) => ({ trip_id: Number(id) || 0, user_id: m.id, role: 'Member' })));
          });
        }

        if (bookingsRes.ok) {
          const data = await bookingsRes.json();
          const existingIds = await db.bookings.where('trip_id').equals(Number(id)).primaryKeys();
          const incomingIds = data.map((b: any) => b.id);
          const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid as number));
          await db.transaction('rw', db.bookings, async () => {
            if (idsToDelete.length > 0) await db.bookings.bulkDelete(idsToDelete as number[]);
            await db.bookings.bulkPut(data);
          });
        }
      } catch (err) { console.error('Failed to sync trip details:', err); } finally { setIsLoading(false); }
    };
    fetchTripDetails();
  }, [id, user?.role, _hasHydrated, token]);

  useEffect(() => {
    if (trip?.start_date) {
      const parsedStart = safeParse(trip.start_date);
      if (parsedStart) setSelectedDate(parsedStart);
    }
  }, [trip?.start_date]);

  const tripUsers = useLiveQuery(async () => {
    if (!id) return [];
    const members = await db.tripMembers.where('trip_id').equals(Number(id)).toArray();
    const userIds = members.map(m => m.user_id);
    return db.users.where('id').anyOf(userIds).toArray();
  }, [id]);

  const handleDeleteItinerary = async (itineraryId: number) => {
    setConfirmConfig({
      isOpen: true, title: '刪除活動', message: '您確定要刪除此活動嗎？此操作無法復原。', confirmText: 'Deleting activity...',
      onConfirm: async () => {
        if (!id) return;
        try {
          const res = await apiFetch(`/api/trips/${id}/itineraries/${itineraryId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete itinerary');
          await db.itineraries.delete(itineraryId);
          setIsItineraryFormOpen(false);
          setEditingItinerary(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) { console.error(err); alert('Failed to delete activity'); }
      }
    });
  };

  const handleDeleteBooking = async (bookingId: number) => {
    setConfirmConfig({
      isOpen: true, title: '刪除預訂', message: '您確定要刪除此預訂資訊嗎？相關的行程項目也會一併刪除。', confirmText: 'Deleting booking...',
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
        } catch (err) { console.error(err); alert('Failed to delete booking'); }
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

  const validTripStartDate = safeParse(trip?.start_date);
  const validTripEndDate = safeParse(trip?.end_date);
  const daysCount = (validTripStartDate && validTripEndDate) ? differenceInDays(validTripEndDate, validTripStartDate) + 1 : 0;
  const dates = Array.from({ length: daysCount }).map((_, i) => addDays(validTripStartDate || new Date(), i));
  const tripCoverImageUrl = trip?.cover_image_url && typeof trip.cover_image_url === 'string' && trip.cover_image_url.startsWith('http') ? trip.cover_image_url : `https://picsum.photos/seed/${trip?.id}/1920/1080`;

  const filteredItineraries = itineraries.filter(i => {
    const parsed = safeParse(i.date);
    return parsed ? isSameDay(parsed, selectedDate) : false;
  }).sort((a, b) => a.start_time.localeCompare(b.start_time));

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
    return parsed ? isSameDay(parsed, selectedDate) : false;
  });

  const getUserNameById = (userId: number) => {
    const u = tripUsers?.find(u => u.id === userId);
    return u ? u.name : `User ${userId}`;
  };

  const availableBookingCategories = useMemo(() => {
    const cats = new Set(bookings.map(b => b.category));
    return ['ALL', ...Array.from(cats)];
  }, [bookings]);

  if (!trip) return <div className="flex items-center justify-center h-full min-h-[50vh]"><div className="text-zinc-500">Loading trip details...</div></div>;

  return (
    <div className="flex flex-col h-screen bg-black overflow-hidden overscroll-none">
      <div className="shrink-0 z-30 bg-black relative shadow-xl">
        <div className="relative h-64 w-full overflow-hidden">
          <img src={tripCoverImageUrl} alt={trip.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none"></div>
          
          <button onClick={() => navigate('/')} className="absolute left-4 p-2 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50 transition-colors z-20 border border-white/10" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}>
            <ArrowLeft size={20} />
          </button>

          {user && (
            <button 
              onClick={handleToggleEditMode}
              className={clsx("absolute right-4 p-2 backdrop-blur-md rounded-full transition-all z-20 border border-white/10 shadow-lg", isEditMode ? "bg-orange-500 text-white" : "bg-black/50 text-white hover:bg-orange-500 transition-all")}
              style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
            >
              {isEditMode ? <Unlock size={20} /> : <Edit3 size={20} />}
            </button>
          )}
          
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <h1 className="text-3xl font-bold text-white mb-1 drop-shadow-lg tracking-tight">{trip.title}</h1>
            <div className="flex items-center gap-3 text-zinc-200 text-sm font-medium">
              <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/10">
                <Calendar size={14} className="text-orange-500" />
                <span>{validTripStartDate ? format(validTripStartDate, 'MMM d') : ''} - {validTripEndDate ? format(validTripEndDate, 'MMM d, yyyy') : ''}</span>
              </div>
            </div>
          </div>
        </div>

        {(activeTab === 'itinerary' || activeTab === 'finance') && (
          <div className="bg-black/95 backdrop-blur-xl border-b border-zinc-800 py-3 px-4">
            <div className="flex overflow-x-auto gap-3 no-scrollbar pb-1">
              {dates.map((date, index) => {
                const isActive = isSameDay(date, selectedDate);
                return (
                  <button
                    key={index} onClick={() => setSelectedDate(date)}
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
          </div>
        )}
      </div>

      <AnimatePresence>
        {isNextTransportFormOpen && editingItinerary && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <NextTransportForm
              isOpen={isNextTransportFormOpen} onClose={() => setIsNextTransportFormOpen(false)} itinerary={editingItinerary}
              onSave={async (data) => {
                await apiFetch(`/api/trips/${id}/itineraries/${editingItinerary.id}`, { method: 'PUT', body: JSON.stringify({ ...editingItinerary, ...data }) });
                setIsNextTransportFormOpen(false);
                const res = await apiFetch(`/api/trips/${id}/itineraries`);
                const itinerariesData = await res.json() as Itinerary[];
                await db.itineraries.bulkPut(itinerariesData);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="flex-1 overflow-y-auto p-4 pb-32 custom-scrollbar overscroll-none">
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
                          item={item} booking={booking} canEdit={canEdit}
                          isConflicted={conflictedIdsInView.has(item.id)}
                          onEdit={() => { setEditingBooking(booking); setIsBookingFormOpen(true); }}
                          showNextTransport={index < filteredItineraries.length - 1}
                          onEditNextTransport={() => { setEditingItinerary(item); setIsNextTransportFormOpen(true); }}
                        />
                      );
                    }
                  }

                  const booking = (item.type === 'ACCOMMODATION' || item.type === 'RENTAL') && item.related_id ? bookings.find(b => b.id === item.related_id) : undefined;
                  return (
                    <div key={`itinerary-${item.id}`} className="space-y-2">
                      <ItineraryCard 
                        item={item} canEdit={canEdit}
                        isConflicted={conflictedIdsInView.has(item.id)}
                        onEdit={() => {
                          setEditingItinerary(item); 
                          setIsItineraryFormOpen(true); 
                        }}
                        selectedDate={selectedDate} showNextTransport={index < filteredItineraries.length - 1}
                        onEditNextTransport={() => { setEditingItinerary(item); setIsNextTransportFormOpen(true); }}
                        booking={booking}
                      />
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl"><p>No activities for this day.</p></div>
              )}

              {canEdit && (
                <button onClick={() => setIsItineraryFormOpen(true)} className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all">
                  <Plus size={20} /><span className="font-medium">Add Activity</span>
                </button>
              )}
            </div>
          </div>
        )}

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
                            bookingFilter === cat 
                              ? "bg-orange-500 text-white border-orange-500" 
                              : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800"
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 2. 修改 Booking 卡片的排序邏輯 (過去的置底，其餘由近到遠) */}
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
                          key={booking.id} booking={booking} canEdit={canEdit}
                          onEdit={() => { setEditingBooking(booking); setIsBookingFormOpen(true); }}
                        />
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

        {activeTab === 'finance' && (
          <div className="space-y-4">
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
            ) : <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl"><p>No expenses recorded for this day.</p></div>}

            {canEdit && (
              <button onClick={() => { setEditingExpense(null); setIsFinanceFormOpen(true); }} className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all">
                <Plus size={20} /><span className="font-medium">Add Expense</span>
              </button>
            )}
          </div>
        )}

        {activeTab === 'settings' && hasEditPermission && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-white mb-6">Trip Settings</h3>
              <TripSettingsForm trip={trip} onSuccess={() => { apiFetch(`/api/trips/${id}`).then(res => res.json() as Promise<Trip>).then(data => db.trips.put(data)); }} />
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-around px-4 pt-2 z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]" style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}>
        <button onClick={() => setActiveTab('itinerary')} className={clsx("flex flex-col items-center justify-center w-full h-12 space-y-1 transition-colors active:scale-95", activeTab === 'itinerary' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300")}>
          <Map size={24} strokeWidth={activeTab === 'itinerary' ? 2.5 : 2} /><span className="text-[10px] font-bold uppercase tracking-wider">Itinerary</span>
        </button>
        <button onClick={() => setActiveTab('info')} className={clsx("flex flex-col items-center justify-center w-full h-12 space-y-1 transition-colors active:scale-95", activeTab === 'info' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300")}>
          <Info size={24} strokeWidth={activeTab === 'info' ? 2.5 : 2} /><span className="text-[10px] font-bold uppercase tracking-wider">Info</span>
        </button>
        <button onClick={() => setActiveTab('finance')} className={clsx("flex flex-col items-center justify-center w-full h-12 space-y-1 transition-colors active:scale-95", activeTab === 'finance' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300")}>
          <Wallet size={24} strokeWidth={activeTab === 'finance' ? 2.5 : 2} /><span className="text-[10px] font-bold uppercase tracking-wider">Finance</span>
        </button>
        {hasEditPermission && (
          <button onClick={() => setActiveTab('settings')} className={clsx("flex flex-col items-center justify-center w-full h-12 space-y-1 transition-colors active:scale-95", activeTab === 'settings' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300")}>
            <Settings size={24} strokeWidth={activeTab === 'settings' ? 2.5 : 2} /><span className="text-[10px] font-bold uppercase tracking-wider">Settings</span>
          </button>
        )}
      </div>

      <AnimatePresence>
        {isFinanceFormOpen && id && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsFinanceFormOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-md z-10">
              <FinanceForm 
                tripId={id} defaultDate={format(selectedDate, 'yyyy-MM-dd')} currencies={trip.currencies || ['TWD']} initialData={editingExpense}
                onSuccess={() => { setIsFinanceFormOpen(false); apiFetch(`/api/trips/${id}/expenses`).then(res => res.json() as Promise<Expense[]>).then(data => db.expenses.bulkPut(data)); }} 
                onCancel={() => setIsFinanceFormOpen(false)} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isItineraryFormOpen && id && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsItineraryFormOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-md z-10">
              <ItineraryForm 
                tripId={Number(id)} defaultCityId={trip.default_city_id} date={format(selectedDate, 'yyyy-MM-dd')} initialData={editingItinerary} onDelete={handleDeleteItinerary}
                onSuccess={async () => { 
                  setIsItineraryFormOpen(false); 
                  setEditingItinerary(null); 
                  const [bRes, iRes] = await Promise.all([apiFetch(`/api/trips/${id}/bookings`), apiFetch(`/api/trips/${id}/itineraries`)]);
                  if (bRes.ok) await db.bookings.bulkPut(await bRes.json() as any[]);
                  if (iRes.ok) await db.itineraries.bulkPut(await iRes.json() as any[]);
                }} 
                onCancel={() => { setIsItineraryFormOpen(false); setEditingItinerary(null); }} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isBookingFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBookingFormOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="relative w-full max-w-2xl z-10">
              <BookingForm
                tripId={Number(id)} initialData={editingBooking || undefined}
                onSuccess={async () => {
                  setIsBookingFormOpen(false);
                  setEditingBooking(null);
                  try {
                    const [bookingsRes, itinerariesRes] = await Promise.all([
                      apiFetch(`/api/trips/${id}/bookings`), apiFetch(`/api/trips/${id}/itineraries`)
                    ]);
                    if (bookingsRes.ok) {
                      const data = await bookingsRes.json() as any[];
                      const existingIds = await db.bookings.where('trip_id').equals(Number(id)).primaryKeys();
                      const incomingIds = data.map((b: any) => b.id);
                      const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid as number));
                      await db.transaction('rw', db.bookings, async () => {
                        if (idsToDelete.length > 0) await db.bookings.bulkDelete(idsToDelete as number[]);
                        await db.bookings.bulkPut(data);
                      });
                    }
                    if (itinerariesRes.ok) {
                      const data = await itinerariesRes.json() as any[];
                      const existingIds = await db.itineraries.where('trip_id').equals(Number(id)).primaryKeys();
                      const incomingIds = data.map((i: any) => i.id);
                      const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid as number));
                      await db.transaction('rw', db.itineraries, async () => {
                        if (idsToDelete.length > 0) await db.itineraries.bulkDelete(idsToDelete as number[]);
                        await db.itineraries.bulkPut(data);
                      });
                    }
                  } catch (e) { console.error('Failed to refresh data:', e); }
                }}
                onCancel={() => { setIsBookingFormOpen(false); setEditingBooking(null); }}
                onDelete={handleDeleteBooking}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
      />
    </div>
  );
}