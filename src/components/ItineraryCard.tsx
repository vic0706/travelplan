import React, { useState, useEffect } from 'react';
import { Bed, Car, Map, Plus, ChevronDown, ChevronUp, Footprints, Bus, Bike } from 'lucide-react';
import { clsx } from 'clsx';
import { format, parseISO, isSameDay, isPast } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary, Booking } from '../types';
import { DynamicIcon } from './DynamicIcon';
import { SubItemRow } from './SubItemRow';

interface ItineraryCardProps {
  item: Itinerary;
  canEdit: boolean;
  isConflicted?: boolean;
  onEdit: () => void;
  selectedDate: Date;
  showNextTransport?: boolean;
  onEditNextTransport?: () => void;
  booking?: Booking;
  expandSignal: number;
  collapseSignal: number;
}

export function ItineraryCard({ item, canEdit, isConflicted, onEdit, selectedDate, showNextTransport, onEditNextTransport, booking, expandSignal, collapseSignal }: ItineraryCardProps) {
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const itemDateTime = parseISO(`${dateStr}T${item.start_time || '00:00'}`);
  const isToday = isSameDay(selectedDate, new Date());
  const isPastItem = !isNaN(itemDateTime.getTime()) && isPast(itemDateTime) && !isToday;

  const subItems = item.sub_items ? JSON.parse(item.sub_items) : [];
  const hasNotes = !!item.notes;
  const hasTags = Array.isArray(item.tags) && item.tags.length > 0;
  const hasSubItems = subItems.length > 0;
  const itineraryImageUrl = item.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('http') ? item.image_url : null;

  const hasExpandableContent = hasNotes || hasTags || hasSubItems || !!itineraryImageUrl;
  const [isExpanded, setIsExpanded] = useState(!isPastItem && hasExpandableContent);
  const [showDetails, setShowDetails] = useState(false);
  
  useEffect(() => { setIsExpanded(!isPastItem && hasExpandableContent); }, [isPastItem, hasExpandableContent]);
  useEffect(() => { if (expandSignal > 0 && hasExpandableContent) setIsExpanded(true); }, [expandSignal, hasExpandableContent]);
  useEffect(() => { if (collapseSignal > 0 && hasExpandableContent) setIsExpanded(false); }, [collapseSignal, hasExpandableContent]);

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
            <div className={clsx("w-1.5 h-1.5 rounded-full", isPastItem ? "bg-zinc-600" : "bg-orange-500")} />
            <span className="font-mono text-sm font-medium tracking-wide">{item.start_time} - {item.start_time === item.end_time ? 'Auto' : item.end_time}</span>
          </div>
          <h3 className="text-xl font-bold text-white leading-tight flex items-center">
            {item.type === 'ACCOMMODATION' && <Bed className={clsx("mr-2 shrink-0", isPastItem ? "text-zinc-500" : "text-orange-500")} size={20} />}
            {item.type === 'RENTAL' && <Car className={clsx("mr-2 shrink-0", isPastItem ? "text-zinc-500" : "text-orange-500")} size={20} />}
            {item.icon && <DynamicIcon name={item.icon} className={clsx("mr-2 shrink-0", isPastItem ? "text-zinc-500" : "text-orange-500")} size={20} />}
            {item.title}
          </h3>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-col items-center bg-zinc-800/50 rounded-2xl border border-zinc-700/50 overflow-hidden shadow-sm backdrop-blur-sm">
            <a 
              href={item.address && item.address.startsWith('http') ? item.address : `http://maps.google.com/?q=${encodeURIComponent(item.address || item.title)}`}
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
                      {item.next_transport_mode === 'BICYCLING' && <Bike size={16} />}
                      {item.next_transport_mode === 'TRANSIT' && <Bus size={16} />}
                      {item.next_transport_mode === 'DRIVING' && <Car size={16} />}
                      {(item.next_transport_time || item.next_transport_auto_time) && <span className="text-[9px] font-mono font-bold leading-none mt-0.5">{item.next_transport_time ? item.next_transport_time.replace(' min', 'm') : 'Auto'}</span>}
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
        <div className={clsx("absolute inset-0 transition-colors duration-300", itineraryImageUrl ? (showDetails ? "bg-black/80 backdrop-blur-sm" : "bg-gradient-to-b from-zinc-900/40 via-transparent to-black/60") : "bg-gradient-to-br from-orange-900/10 via-transparent to-black/30")} />
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