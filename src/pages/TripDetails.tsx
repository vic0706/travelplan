import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { format, parseISO, addDays, differenceInDays, isSameDay, isPast } from 'date-fns';
import { MapPin, Clock, Plus, Navigation, DollarSign, Plane, Bed, Map, Info, Wallet, ArrowLeft, Calendar, X, Settings, Edit3, ChevronDown, ChevronUp, Image as ImageIcon, Lock, Unlock, Trash2 } from 'lucide-react';
import { Trip, Itinerary, Expense, User } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { clsx } from 'clsx';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getApiUrl, apiFetch } from '../utils/api';
import { FinanceForm } from '../components/FinanceForm';
import { ItineraryForm } from '../components/ItineraryForm';
import { TripSettingsForm } from '../components/TripSettingsForm';
import { WeatherWidget } from '../components/WeatherWidget';
import { FlightForm } from '../components/FlightForm';
import { AccommodationForm } from '../components/AccommodationForm';
import { FinanceOverview } from '../components/FinanceOverview';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { motion, AnimatePresence } from 'framer-motion';

// ... (rest of imports)

// Flight Card Component
function FlightCard({ item, flight, canEdit, onEdit }: { item?: Itinerary; flight?: any; canEdit: boolean; onEdit: () => void }) {
  if (!flight) return null;

  const depDate = parseISO(flight.departure_date);
  const arrDate = parseISO(flight.arrival_date);
  const isCrossDay = flight.departure_date !== flight.arrival_date;
  
  return (
    <div 
      className={clsx(
        "bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-lg relative group transition-all",
        canEdit && "cursor-pointer hover:border-orange-500/50"
      )}
      onClick={() => canEdit && onEdit()}
    >
      {/* Header with Airline Info */}
      <div className="bg-zinc-950/50 p-4 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
            <Plane className="text-orange-500" size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-lg">{flight.airline}</div>
            <div className="text-zinc-500 text-xs font-mono tracking-wider">{flight.flight_code}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Departure</div>
            <div className="text-xs font-bold text-zinc-300">
              {format(depDate, 'MMM d')}
              {isCrossDay && <span className="text-orange-500 ml-1">+{differenceInDays(arrDate, depDate)}d</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Flight Timeline */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            <div className="text-2xl font-bold text-white">{flight.departure_airport}</div>
            <div className="text-sm font-medium text-zinc-300 mt-0.5">{flight.departure_time}</div>
            {flight.departure_terminal && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 rounded-md border border-zinc-700">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Terminal</span>
                <span className="text-xs font-bold text-orange-500">{flight.departure_terminal}</span>
              </div>
            )}
          </div>
          
          <div className="px-4 flex flex-col items-center">
            <div className="w-16 h-px bg-zinc-700 relative">
              <Plane className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-600 bg-zinc-900 px-1" size={14} />
            </div>
          </div>

          <div className="flex-1 text-right">
            <div className="text-2xl font-bold text-white">{flight.arrival_airport}</div>
            <div className="text-sm font-medium text-zinc-300 mt-0.5">{flight.arrival_time}</div>
            {flight.arrival_terminal && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 rounded-md border border-zinc-700">
                <span className="text-[10px] text-zinc-500 font-bold uppercase">Terminal</span>
                <span className="text-xs font-bold text-orange-500">{flight.arrival_terminal}</span>
              </div>
            )}
          </div>
        </div>

        {/* 4-Point Timeline - Only show if part of itinerary */}
        {item && (
          <div className="relative pt-6 pb-2">
            {/* Line */}
            <div className="absolute top-8 left-4 right-4 h-0.5 bg-zinc-800"></div>
            
            <div className="flex justify-between relative">
              {/* Check-in */}
              <div className="flex flex-col items-center gap-2 relative z-10 group/point">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider opacity-0 group-hover/point:opacity-100 transition-opacity absolute -top-6 whitespace-nowrap">Check-in</div>
                <div className="w-3 h-3 rounded-full bg-zinc-700 border-2 border-zinc-900 group-hover/point:bg-orange-500 transition-colors"></div>
                <div className="text-xs font-mono text-zinc-500">{item.start_time}</div>
              </div>

              {/* Departure */}
              <div className="flex flex-col items-center gap-2 relative z-10 group/point">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider opacity-0 group-hover/point:opacity-100 transition-opacity absolute -top-6 whitespace-nowrap">Departure</div>
                <div className="w-3 h-3 rounded-full bg-zinc-500 border-2 border-zinc-900 group-hover/point:bg-orange-500 transition-colors"></div>
                <div className="text-xs font-mono text-zinc-300">{flight.departure_time}</div>
              </div>

              {/* Arrival */}
              <div className="flex flex-col items-center gap-2 relative z-10 group/point">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider opacity-0 group-hover/point:opacity-100 transition-opacity absolute -top-6 whitespace-nowrap">Arrival</div>
                <div className="w-3 h-3 rounded-full bg-zinc-500 border-2 border-zinc-900 group-hover/point:bg-orange-500 transition-colors"></div>
                <div className="text-xs font-mono text-zinc-300">{flight.arrival_time}</div>
              </div>

              {/* Stay End */}
              <div className="flex flex-col items-center gap-2 relative z-10 group/point">
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider opacity-0 group-hover/point:opacity-100 transition-opacity absolute -top-6 whitespace-nowrap">Exit</div>
                <div className="w-3 h-3 rounded-full bg-zinc-700 border-2 border-zinc-900 group-hover/point:bg-orange-500 transition-colors"></div>
                <div className="text-xs font-mono text-zinc-500">{item.end_time}</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between pt-4 border-t border-zinc-800/50">
           <div className="text-xs text-zinc-500 italic max-w-[70%] truncate">
             {item?.notes || flight.notes}
           </div>
           <a 
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(flight.departure_airport + ' airport')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-2 text-zinc-400 hover:text-orange-500 bg-zinc-950/50 rounded-xl border border-zinc-800/50 transition-colors"
          >
            <Navigation size={16} />
          </a>
        </div>
      </div>
    </div>
  );
}

// Accommodation Card Component
function AccommodationCard({ acc, canEdit, onEdit }: { acc: any; canEdit: boolean; onEdit: () => void }) {
  const handleLocationClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!acc.address && !acc.hotel_name) return;

    // 1. If URL, jump to URL
    if (acc.address && (acc.address.startsWith('http://') || acc.address.startsWith('https://'))) {
      window.open(acc.address, '_blank');
      return;
    }

    // 2. If text, search text on Google Maps. If empty, search hotel name.
    const query = acc.address || acc.hotel_name;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
  };

  return (
    <div 
      className={clsx(
        "bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-lg relative group transition-all",
        canEdit && "cursor-pointer hover:border-orange-500/50"
      )}
      onClick={() => canEdit && onEdit()}
    >
      {/* Header */}
      <div className="bg-zinc-950/50 p-4 border-b border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
            <Bed className="text-orange-500" size={20} />
          </div>
          <div>
            <div className="text-white font-bold text-lg">{acc.hotel_name}</div>
            {acc.order_id && <div className="text-orange-500 text-[10px] font-bold uppercase tracking-wider">ID: {acc.order_id}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Stay</div>
          <div className="text-xs font-bold text-zinc-300">
            {format(parseISO(acc.check_in_date), 'MMM d')} - {format(parseISO(acc.check_out_date), 'MMM d')}
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex-1">
            <div className="flex gap-6">
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Check-in</div>
                <div className="text-sm font-bold text-white">{acc.check_in_time || '16:00'}</div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Check-out</div>
                <div className="text-sm font-bold text-white">{acc.check_out_time || '11:00'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-zinc-800/50 flex items-center justify-between gap-4">
          <div className="text-xs text-zinc-500 italic line-clamp-2 flex-1">
            {acc.notes ? `"${acc.notes}"` : "No notes"}
          </div>
          <button 
            onClick={handleLocationClick}
            className="p-2 text-zinc-400 hover:text-orange-500 bg-zinc-950/50 rounded-xl border border-zinc-800/50 transition-colors shadow-inner shrink-0"
          >
            <Navigation size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Itinerary Card Component
function ItineraryCard({ item, canEdit, onEdit }: { item: Itinerary; canEdit: boolean; onEdit: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const subItems = item.sub_items ? JSON.parse(item.sub_items) : [];
  const hasSubItems = subItems.length > 0;
  const itineraryImageUrl = item.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('http')
    ? item.image_url
    : null;

  const handleClick = () => {
    if (canEdit) {
      onEdit();
    } else if (hasSubItems) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div 
      className={clsx(
        "bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-lg group relative transition-all",
        canEdit ? "cursor-pointer hover:border-orange-500/50" : (hasSubItems ? "cursor-pointer hover:border-zinc-700" : "")
      )}
      onClick={handleClick}
    >
      {itineraryImageUrl && (
        <div className="h-32 w-full relative">
          <img src={itineraryImageUrl} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent"></div>
        </div>
      )}
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full">
              <Clock size={14} />
              <span className="text-xs font-bold tracking-wider">{item.start_time} - {item.end_time}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {Array.isArray(item.tags) && item.tags.map((tag: string) => (
              <span key={tag} className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>
        
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-semibold text-white mb-2 flex-1">{item.title}</h3>
          
        {/* Address Button on the right */}
          <a 
            href={item.address && item.address.startsWith('http') 
              ? item.address 
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.title)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center text-zinc-400 hover:text-orange-500 transition-colors bg-zinc-950/50 w-8 h-8 rounded-full border border-zinc-800/50 shrink-0"
          >
            <MapPin size={16} />
          </a>
        </div>

        {item.notes && (
          <p className="mt-2 text-sm text-zinc-500 leading-relaxed bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50 mb-2">
            {item.notes}
          </p>
        )}

        {hasSubItems && !canEdit && (
          <div className="flex items-center justify-center mt-2">
            {isExpanded ? <ChevronUp size={16} className="text-zinc-600" /> : <ChevronDown size={16} className="text-zinc-600" />}
          </div>
        )}

        <AnimatePresence>
          {isExpanded && hasSubItems && !canEdit && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-2 pt-2 border-t border-zinc-800/50">
                {subItems.map((sub: any, idx: number) => (
                  <div key={sub.id || idx} className="flex flex-col gap-1 text-sm text-zinc-400 bg-zinc-950/30 p-3 rounded-lg border border-zinc-800/30">
                    <div className="flex items-start gap-3">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                      <div className="flex-1">
                        <div className="text-zinc-300 font-medium flex justify-between">
                          <span>{sub.title || sub.text}</span>
                          {(sub.start_time || sub.end_time) && (
                            <span className="text-xs text-zinc-500 font-mono">
                              {sub.start_time} - {sub.end_time}
                            </span>
                          )}
                        </div>
                        {Array.isArray(sub.tags) && sub.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {sub.tags.map((tag: string) => (
                              <span key={tag} className="text-[9px] uppercase tracking-wider text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded-md">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        {sub.notes && (
                          <div className="text-xs text-zinc-600 mt-1 italic">
                            {sub.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function TripDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, _hasHydrated, token } = useAppStore();
  
  // 1. Live Query from IndexedDB (Offline-First)
  const trip = useLiveQuery(() => db.trips.get(Number(id) || 0), [id]);
  const itineraries = useLiveQuery(() => db.itineraries.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const expenses = useLiveQuery(() => db.expenses.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const members = useLiveQuery(() => db.tripMembers.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const flights = useLiveQuery(() => db.flights.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const accommodations = useLiveQuery(() => db.accommodations.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];

  const [activeTab, setActiveTab] = useState<'itinerary' | 'info' | 'finance' | 'settings'>('itinerary');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  
  const [isFinanceFormOpen, setIsFinanceFormOpen] = useState(false);
  const [isItineraryFormOpen, setIsItineraryFormOpen] = useState(false);
  const [isFlightFormOpen, setIsFlightFormOpen] = useState(false);
  const [isAccommodationFormOpen, setIsAccommodationFormOpen] = useState(false);
  
  const [editingItinerary, setEditingItinerary] = useState<Itinerary | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const safeParse = (dateStr: any) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
      const parsed = parseISO(dateStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch (e) {
      return null;
    }
  };

  // 2. Smart Caching & On-Demand Fetching Logic
  useEffect(() => {
    if (!id || !navigator.onLine || !_hasHydrated) return;

    const fetchTripDetails = async () => {
      setIsLoading(true);
      try {
        // Fetch Trip Basic Info first
        const tripRes = await apiFetch(`/api/trips/${id}`);
        if (!tripRes.ok) throw new Error('Trip fetch failed');
        const tripData = await tripRes.json() as Trip;
        
        const tripEndDate = safeParse(tripData.end_date);
        const isPastTrip = tripEndDate && isPast(tripEndDate) && !isSameDay(tripEndDate, new Date());
        const shouldDeepCache = user?.role !== 'Guest' && !isPastTrip;

        // Update Trip in DB with last_accessed
        await db.trips.put({
          ...tripData,
          last_accessed: Date.now(),
          is_fully_synced: shouldDeepCache
        });

        const [itinerariesRes, expensesRes, membersRes, flightsRes, accommodationsRes] = await Promise.all([
          apiFetch(`/api/trips/${id}/itineraries`),
          apiFetch(`/api/trips/${id}/expenses`),
          apiFetch(`/api/trips/${id}/members`),
          apiFetch(`/api/trips/${id}/flights`),
          apiFetch(`/api/trips/${id}/accommodations`)
        ]);

        if (itinerariesRes.ok) {
          const itinerariesData = await itinerariesRes.json() as Itinerary[];
          if (Array.isArray(itinerariesData)) {
            await db.itineraries.bulkPut(itinerariesData);
          }
        }

        if (expensesRes.ok) {
          const expensesData = await expensesRes.json() as Expense[];
          if (Array.isArray(expensesData)) {
            await db.expenses.bulkPut(expensesData);
          }
        }

        if (membersRes.ok) {
          const membersData = await membersRes.json() as User[];
          if (Array.isArray(membersData)) {
            // Update users table
            await db.users.bulkPut(membersData.map((m) => ({
              id: m.id,
              name: m.name,
              role: m.role,
              avatar_url: m.avatar_url || '',
              allow_login: 1 // Assuming they are active
            })));

            // Update tripMembers relation
            await db.tripMembers.bulkPut(membersData.map((m) => ({
              trip_id: Number(id) || 0,
              user_id: m.id,
              role: 'Member'
            })));
          }
        }

        if (flightsRes.ok) {
          const flightsData = await flightsRes.json();
          if (Array.isArray(flightsData)) {
            await db.flights.bulkPut(flightsData);
          }
        }

        if (accommodationsRes.ok) {
          const accommodationsData = await accommodationsRes.json();
          if (Array.isArray(accommodationsData)) {
            await db.accommodations.bulkPut(accommodationsData);
          }
        }

      } catch (err) {
        console.error('Failed to sync trip details:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTripDetails();
  }, [id, user?.role, _hasHydrated, token]);

  // Update selectedDate when trip loads
  useEffect(() => {
    if (trip?.start_date) {
      const parsedStart = safeParse(trip.start_date);
      if (parsedStart) {
        setSelectedDate(parsedStart);
      }
    }
  }, [trip?.start_date]);

  const tripUsers = useLiveQuery(async () => {
    if (!id) return [];
    const members = await db.tripMembers.where('trip_id').equals(Number(id)).toArray();
    const userIds = members.map(m => m.user_id);
    return db.users.where('id').anyOf(userIds).toArray();
  }, [id]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingFlight, setEditingFlight] = useState<any>(null);
  const [editingAccommodation, setEditingAccommodation] = useState<any>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm Delete',
    onConfirm: () => {}
  });

  const handleDeleteItinerary = async (itineraryId: number) => {
    setConfirmConfig({
      isOpen: true,
      title: '刪除活動',
      message: '您確定要刪除此活動嗎？此操作無法復原。',
      confirmText: 'Deleting activity...',
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

  const handleDeleteFlight = async (flightId: number) => {
    setConfirmConfig({
      isOpen: true,
      title: '刪除航班',
      message: '您確定要刪除此航班嗎？相關的行程項目也會一併刪除。',
      confirmText: 'Deleting flight...',
      onConfirm: async () => {
        if (!id) return;
        try {
          const res = await apiFetch(`/api/trips/${id}/flights/${flightId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete flight');
          await db.flights.delete(flightId);
          // Also need to delete the associated itinerary item
          const relatedItinerary = itineraries.find(i => i.type === 'FLIGHT' && i.related_id === flightId);
          if (relatedItinerary) {
            await db.itineraries.delete(relatedItinerary.id);
          }
          setIsFlightFormOpen(false);
          setEditingFlight(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error(err);
          alert('Failed to delete flight');
        }
      }
    });
  };

  const handleDeleteAccommodation = async (accId: number) => {
    setConfirmConfig({
      isOpen: true,
      title: '刪除住宿',
      message: '您確定要刪除此住宿資訊嗎？',
      confirmText: 'Deleting accommodation...',
      onConfirm: async () => {
        if (!id) return;
        try {
          const res = await apiFetch(`/api/trips/${id}/accommodations/${accId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to delete accommodation');
          await db.accommodations.delete(accId);
          setIsAccommodationFormOpen(false);
          setEditingAccommodation(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error(err);
          alert('Failed to delete accommodation');
        }
      }
    });
  };

  // Access Control Logic
  const isMember = user && (
    members.some(m => Number(m.user_id) === Number(user.id)) ||
    (trip?.members && Array.isArray(trip.members) && trip.members.some((m: any) => Number(m.user_id) === Number(user.id)))
  );
  const isAdmin = user?.role?.toLowerCase() === 'admin';
  const hasEditPermission = !!(isMember || isAdmin);
  const canEdit = hasEditPermission && isEditMode;

  if (!trip) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <div className="text-zinc-500">Loading trip details...</div>
      </div>
    );
  }

  const validTripStartDate = safeParse(trip.start_date);
  const validTripEndDate = safeParse(trip.end_date);

  const daysCount = (validTripStartDate && validTripEndDate) ? differenceInDays(validTripEndDate, validTripStartDate) + 1 : 0;
  const dates = Array.from({ length: daysCount }).map((_, i) => addDays(validTripStartDate || new Date(), i));

  const tripCoverImageUrl = trip.cover_image_url && typeof trip.cover_image_url === 'string' && trip.cover_image_url.startsWith('http')
    ? trip.cover_image_url
    : `https://picsum.photos/seed/${trip.id}/1920/1080`;

  const filteredItineraries = itineraries.filter(i => {
    const parsed = safeParse(i.date);
    return parsed ? isSameDay(parsed, selectedDate) : false;
  }).sort((a, b) => a.start_time.localeCompare(b.start_time)); // Ensure sorted by time

  const filteredExpenses = expenses.filter(e => {
    const parsed = safeParse(e.date);
    return parsed ? isSameDay(parsed, selectedDate) : false;
  });

  const expenseData = expenses.reduce((acc, curr) => {
    const existing = acc.find(item => item.name === curr.item_name);
    if (existing) {
      existing.value += curr.amount;
    } else {
      acc.push({ name: curr.item_name, value: curr.amount });
    }
    return acc;
  }, [] as { name: string, value: number }[]);

  const totalExpenses = expenses.reduce((sum, curr) => sum + curr.amount, 0);

  const COLORS = ['#f97316', '#fb923c', '#fdba74', '#ffedd5'];

  const getUserNameById = (userId: number) => {
    const u = tripUsers?.find(u => u.id === userId);
    return u ? u.name : `User ${userId}`;
  };

  return (
    <div className="flex flex-col min-h-full bg-black pb-32">
      {/* Trip Header */}
      <div className="relative h-64 w-full overflow-hidden shrink-0">
        <img 
          src={tripCoverImageUrl} 
          alt={trip.title} 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        {/* Top Gradient for Status Bar Visibility */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none"></div>
        {/* Bottom Gradient for Text Visibility */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none"></div>
        
        <button 
          onClick={() => navigate('/')}
          className="absolute left-4 p-2 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-black/50 transition-colors z-20 border border-white/10"
          style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <ArrowLeft size={20} />
        </button>

        {user && (
          <button 
            onClick={() => {
              if (hasEditPermission) {
                setIsEditMode(!isEditMode);
              } else {
                alert('您沒有編輯此行程的權限。');
              }
            }}
            className={clsx(
              "absolute right-4 p-2 backdrop-blur-md rounded-full transition-all z-20 border border-white/10 shadow-lg",
              isEditMode ? "bg-orange-500 text-white" : "bg-black/50 text-white hover:bg-orange-500 transition-all"
            )}
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

      {/* Date Slider */}
      {(activeTab === 'itinerary' || activeTab === 'finance') && (
        <div className="sticky top-0 z-30 bg-black/95 backdrop-blur-xl border-b border-zinc-800 py-3 px-4 shadow-xl">
          <div className="flex overflow-x-auto gap-3 no-scrollbar pb-1">
            {dates.map((date, index) => {
              const isActive = isSameDay(date, selectedDate);
              return (
                <button
                  key={index}
                  onClick={() => setSelectedDate(date)}
                  className={clsx(
                    "flex flex-col items-center justify-center min-w-[56px] h-16 rounded-xl transition-all shrink-0",
                    isActive 
                      ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20 scale-105" 
                      : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800"
                  )}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
                    {date instanceof Date && !isNaN(date.getTime()) ? format(date, 'EEE') : '---'}
                  </span>
                  <span className="text-lg font-bold mt-0.5">
                    {date instanceof Date && !isNaN(date.getTime()) ? format(date, 'd') : '--'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-4">
        {activeTab === 'itinerary' && (
          <div className="space-y-6">
            {/* Weather Widget */}
            {id && <WeatherWidget tripId={Number(id)} date={selectedDate} />}

            {/* Itinerary Cards */}
            <div className="space-y-4">
              {filteredItineraries.length > 0 ? (
                filteredItineraries.map((item, index) => {
                  if (item.type === 'FLIGHT' && item.related_id) {
                    const flight = flights.find(f => f.id === item.related_id);
                    return (
                      <FlightCard
                        key={item.id}
                        item={item}
                        flight={flight}
                        canEdit={canEdit}
                        onEdit={() => {
                          if (flight) {
                            setEditingFlight(flight);
                            setIsFlightFormOpen(true);
                          }
                        }}
                      />
                    );
                  }

                  const itineraryImageUrl = item.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('http')
                    ? item.image_url
                    : null;
                  
                  return (
                    <ItineraryCard 
                      key={item.id} 
                      item={item} 
                      canEdit={canEdit}
                      onEdit={() => {
                        setEditingItinerary(item);
                        setIsItineraryFormOpen(true);
                      }}
                    />
                  );
                })
              ) : (
                <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
                  <p>No activities for this day.</p>
                </div>
              )}

              {canEdit && (
                <button 
                  onClick={() => setIsItineraryFormOpen(true)}
                  className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
                >
                  <Plus size={20} />
                  <span className="font-medium">Add Activity</span>
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'info' && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-white mb-6">Expenses Overview</h3>
              <FinanceOverview 
                expenses={expenses} 
                members={tripUsers || []} 
                currency={trip.currencies?.[0] || 'TWD'} 
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                 <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Flight Details</h4>
                 {canEdit && (
                   <button onClick={() => setIsFlightFormOpen(true)} className="text-orange-500 hover:text-orange-400">
                     <Plus size={18} />
                   </button>
                 )}
              </div>
              {flights.length > 0 ? (
                flights.map(flight => (
                  <FlightCard
                    key={flight.id}
                    flight={flight}
                    canEdit={canEdit}
                    onEdit={() => {
                      setEditingFlight(flight);
                      setIsFlightFormOpen(true);
                    }}
                  />
                ))
              ) : (
                <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-6 text-center text-zinc-500 text-sm">
                  No flight details added.
                </div>
              )}

              <div className="flex items-center justify-between px-2 mt-6">
                <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Accommodation</h4>
                {canEdit && (
                  <button onClick={() => setIsAccommodationFormOpen(true)} className="text-orange-500 hover:text-orange-400">
                     <Plus size={18} />
                   </button>
                )}
              </div>
              {accommodations.length > 0 ? (
                accommodations.map(acc => (
                  <AccommodationCard
                    key={acc.id}
                    acc={acc}
                    canEdit={canEdit}
                    onEdit={() => {
                      setEditingAccommodation(acc);
                      setIsAccommodationFormOpen(true);
                    }}
                  />
                ))
              ) : (
                <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-6 text-center text-zinc-500 text-sm">
                  No accommodation details added.
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
                  onClick={() => {
                    if (canEdit) {
                      setEditingExpense(expense);
                      setIsFinanceFormOpen(true);
                    }
                  }}
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
                onClick={() => {
                  setEditingExpense(null);
                  setIsFinanceFormOpen(true);
                }}
                className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
              >
                <Plus size={20} />
                <span className="font-medium">Add Expense</span>
              </button>
            )}
          </div>
        )}

        {activeTab === 'settings' && hasEditPermission && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-white mb-6">Trip Settings</h3>
              <TripSettingsForm 
                trip={trip} 
                onSuccess={() => {
                  apiFetch(`/api/trips/${id}`)
                    .then(res => res.json() as Promise<Trip>)
                    .then(data => db.trips.put(data));
                }} 
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tabs */}
      <div 
        className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 flex items-center justify-around px-4 pt-2 z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]"
        style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}
      >
        <button
          onClick={() => setActiveTab('itinerary')}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-12 space-y-1 transition-colors active:scale-95",
            activeTab === 'itinerary' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Map size={24} strokeWidth={activeTab === 'itinerary' ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Itinerary</span>
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-12 space-y-1 transition-colors active:scale-95",
            activeTab === 'info' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Info size={24} strokeWidth={activeTab === 'info' ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Info</span>
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-12 space-y-1 transition-colors active:scale-95",
            activeTab === 'finance' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Wallet size={24} strokeWidth={activeTab === 'finance' ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Finance</span>
        </button>
        {hasEditPermission && (
          <button
            onClick={() => setActiveTab('settings')}
            className={clsx(
              "flex flex-col items-center justify-center w-full h-12 space-y-1 transition-colors active:scale-95",
              activeTab === 'settings' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Settings size={24} strokeWidth={activeTab === 'settings' ? 2.5 : 2} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Settings</span>
          </button>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isFinanceFormOpen && id && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFinanceFormOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md z-10"
            >
              <FinanceForm 
                tripId={id} 
                defaultDate={format(selectedDate, 'yyyy-MM-dd')}
                currencies={trip.currencies || ['TWD']}
                initialData={editingExpense}
                onSuccess={() => {
                  setIsFinanceFormOpen(false);
                  // Refresh expenses
                  apiFetch(`/api/trips/${id}/expenses`)
                    .then(res => res.json() as Promise<Expense[]>)
                    .then(data => db.expenses.bulkPut(data));
                }} 
                onCancel={() => setIsFinanceFormOpen(false)} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Itinerary Form Modal */}
      <AnimatePresence>
        {isItineraryFormOpen && id && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsItineraryFormOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md z-10"
            >
              <ItineraryForm 
                tripId={Number(id)} 
                defaultCityId={trip.default_city_id}
                date={format(selectedDate, 'yyyy-MM-dd')}
                initialData={editingItinerary}
                onDelete={handleDeleteItinerary}
                onSuccess={() => {
                  setIsItineraryFormOpen(false);
                  setEditingItinerary(null);
                  // Refresh itineraries
                  apiFetch(`/api/trips/${id}/itineraries`)
                    .then(res => res.json() as Promise<Itinerary[]>)
                    .then(data => db.itineraries.bulkPut(data));
                }} 
                onCancel={() => {
                  setIsItineraryFormOpen(false);
                  setEditingItinerary(null);
                }} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Flight Form Modal */}
      <AnimatePresence>
        {isFlightFormOpen && id && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsFlightFormOpen(false);
                setEditingFlight(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md z-10"
            >
              <FlightForm 
                tripId={Number(id)} 
                initialData={editingFlight}
                onDelete={handleDeleteFlight}
                onSuccess={() => {
                  setIsFlightFormOpen(false);
                  setEditingFlight(null);
                  apiFetch(`/api/trips/${id}/flights`)
                    .then(res => res.json() as Promise<any[]>)
                    .then(data => db.flights.bulkPut(data));
                  // Also refresh itineraries as flight adds an itinerary item
                  apiFetch(`/api/trips/${id}/itineraries`)
                    .then(res => res.json() as Promise<Itinerary[]>)
                    .then(data => db.itineraries.bulkPut(data));
                }} 
                onCancel={() => {
                  setIsFlightFormOpen(false);
                  setEditingFlight(null);
                }} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Accommodation Form Modal */}
      <AnimatePresence>
        {isAccommodationFormOpen && id && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAccommodationFormOpen(false);
                setEditingAccommodation(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md z-10"
            >
              <AccommodationForm 
                tripId={Number(id)} 
                initialData={editingAccommodation}
                onDelete={handleDeleteAccommodation}
                onSuccess={() => {
                  setIsAccommodationFormOpen(false);
                  setEditingAccommodation(null);
                  apiFetch(`/api/trips/${id}/accommodations`)
                    .then(res => res.json() as Promise<any[]>)
                    .then(data => db.accommodations.bulkPut(data));
                  // Also refresh itineraries
                  apiFetch(`/api/trips/${id}/itineraries`)
                    .then(res => res.json() as Promise<Itinerary[]>)
                    .then(data => db.itineraries.bulkPut(data));
                }} 
                onCancel={() => {
                  setIsAccommodationFormOpen(false);
                  setEditingAccommodation(null);
                }} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Confirm Dialog - Rendered last to stay on top */}
      <ConfirmDialog
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
      />
    </div>
  );
}
