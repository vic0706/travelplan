import React, { useState, useEffect } from 'react';
import { Train, Ship, Car, Plane, Map, Plus, ChevronDown, ChevronUp, Footprints, Bus, Bike } from 'lucide-react';
import { clsx } from 'clsx';
import { format, parseISO, isSameDay, isPast } from 'date-fns';
import { Itinerary, Booking } from '../../types';

const renderLocation = (loc: string, terminal?: string) => {
  if (!loc) return null;
  if (loc.startsWith('http')) {
      return (
          <a href={loc} target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 hover:underline transition-colors" onClick={e => e.stopPropagation()}>
              [ Map Link ]
          </a>
      );
  }
  return <span>{loc}{terminal ? ` (T${terminal})` : ''}</span>;
};

interface TransportationCardProps {
  item?: Itinerary;
  booking?: Booking;
  canEdit: boolean;
  isConflicted?: boolean;
  onEdit: () => void;
  showNextTransport?: boolean;
  onEditNextTransport?: () => void;
  selectedDate: Date;
  expandSignal: number;
  collapseSignal: number;
}

export function TransportationCard({ 
  item, booking, canEdit, isConflicted, onEdit, showNextTransport, onEditNextTransport, selectedDate, expandSignal, collapseSignal 
}: TransportationCardProps) {
  const data = booking;
  if (!data || !item) return null;

  const dep_time = data.start_time;
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

  const itemDateTime = parseISO(`${format(selectedDate, 'yyyy-MM-dd')}T${item.start_time || '00:00'}`);
  const isToday = isSameDay(selectedDate, new Date());
  const isPastItem = !isNaN(itemDateTime.getTime()) && isPast(itemDateTime) && !isToday;
  const isCrossDay = data.start_date !== data.end_date;
  
  const [isExpanded, setIsExpanded] = useState(!isPastItem);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => { setIsExpanded(!isPastItem); }, [isPastItem]);
  useEffect(() => { if (expandSignal > 0) setIsExpanded(true); }, [expandSignal]);
  useEffect(() => { if (collapseSignal > 0) setIsExpanded(false); }, [collapseSignal]);

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
    const depDateTime = parseISO(`${data.start_date}T${dep_time}`);
    const checkinBuffer = dep_buffer || -120;
    const checkinDate = new Date(depDateTime.getTime() + checkinBuffer * 60000); 
    const checkinTimeStr = format(checkinDate, 'HH:mm');

    const arrDateTime = parseISO(`${data.end_date || data.start_date}T${arr_time}`);
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
                href={dep_station && dep_station.startsWith('http') ? dep_station : `http://maps.google.com/?q=${encodeURIComponent(dep_station || title)}`}
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
                        {item.next_transport_mode === 'BICYCLING' && <Bike size={16} />}
                        {item.next_transport_mode === 'TRANSIT' && <Bus size={16} />}
                        {item.next_transport_mode === 'DRIVING' && <Car size={16} />}
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
                                <div className="text-sm font-medium text-zinc-300 mt-1 truncate">
                                    {renderLocation(dep_station)}
                                </div>
                                {dep_terminal && <div className="text-[10px] text-orange-500 mt-0.5">{labels.terminal} {dep_terminal}</div>}
                            </div>
                            <div className="flex flex-col items-center justify-center pt-2">
                                <div className="w-8 h-px bg-zinc-700 relative"><div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 bg-zinc-500 rounded-full"></div></div>
                                {isCrossDay && <span className="text-[9px] text-orange-500 mt-1">+1d</span>}
                            </div>
                            <div className="flex flex-col text-right">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">Arr</div>
                                <div className="text-2xl font-bold text-white leading-none tracking-tight">{arr_time}</div>
                                <div className="text-sm font-medium text-zinc-300 mt-1 truncate">
                                    {renderLocation(arr_station)}
                                </div>
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