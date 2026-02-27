import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { format, parseISO, addDays, differenceInDays, isSameDay, isPast } from 'date-fns';
import { MapPin, Clock, Plus, Navigation, DollarSign, Plane, Bed, Map, Info, Wallet, ArrowLeft, Calendar, X, Settings, Edit3, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
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
import { motion, AnimatePresence } from 'framer-motion';

// ... (rest of imports)

// Itinerary Card Component
function ItineraryCard({ item, canEdit, onEdit }: { item: Itinerary; canEdit: boolean; onEdit: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const subItems = item.sub_items ? JSON.parse(item.sub_items) : [];
  const hasSubItems = subItems.length > 0;
  const itineraryImageUrl = item.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('http')
    ? item.image_url
    : null;

  return (
    <div 
      className={`bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-lg group relative transition-all ${hasSubItems ? 'cursor-pointer hover:border-zinc-700' : ''}`}
      onClick={() => hasSubItems && setIsExpanded(!isExpanded)}
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
            {item.stay_duration && (
               <span className="text-[10px] text-zinc-500 font-medium bg-zinc-800 px-2 py-1 rounded-full">
                 Stay: {item.stay_duration}
               </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {item.tags && item.tags.map((tag: string) => (
              <span key={tag} className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
            {canEdit && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
              >
                <Edit3 size={16} />
              </button>
            )}
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
            className="flex items-center gap-2 text-zinc-400 text-xs hover:text-orange-500 transition-colors bg-zinc-950/50 px-3 py-2 rounded-xl border border-zinc-800/50 shrink-0"
          >
            <MapPin size={14} />
            <span className="max-w-[100px] truncate">{item.address ? 'Map' : 'Search'}</span>
          </a>
        </div>

        {hasSubItems && (
          <div className="flex items-center justify-center mt-2">
            {isExpanded ? <ChevronUp size={16} className="text-zinc-600" /> : <ChevronDown size={16} className="text-zinc-600" />}
          </div>
        )}

        <AnimatePresence>
          {isExpanded && hasSubItems && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-2 pt-4 border-t border-zinc-800/50">
                {subItems.map((sub: any, idx: number) => (
                  <div key={sub.id || idx} className="flex items-start gap-3 text-sm text-zinc-400 bg-zinc-950/30 p-2 rounded-lg">
                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                    <div className="flex-1">
                      <div className="text-zinc-300 font-medium">{sub.title || sub.text}</div>
                      {(sub.start_time || sub.end_time) && (
                        <div className="text-xs text-zinc-600">
                          {sub.start_time} - {sub.end_time}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {item.notes && (
          <p className="mt-4 text-sm text-zinc-500 leading-relaxed bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
            {item.notes}
          </p>
        )}
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
    if (!id || !navigator.onLine || !_hasHydrated || !token) return;

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

  // Access Control Logic
  const isMember = user && members.some(m => m.user_id === user.id);
  const isAdmin = user?.role === 'Admin';
  const canEdit = isMember || isAdmin;

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
  });
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
                  const itineraryImageUrl = item.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('http')
                    ? item.image_url
                    : null;
                  
                  // Use local state for expansion if needed, but mapping inside map requires a component or state array.
                  // I'll create a separate component for ItineraryCard to handle its own state.
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
                  <div key={flight.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                        <Plane className="text-orange-500" size={24} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h4 className="text-white font-medium">{flight.airline} {flight.flight_number}</h4>
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{format(parseISO(flight.departure_date), 'MMM d')}</span>
                        </div>
                        <p className="text-sm text-zinc-400 mt-1">
                          {flight.departure_airport} ({flight.departure_time}) → {flight.arrival_airport} ({flight.arrival_time})
                        </p>
                      </div>
                    </div>
                    {(flight.departure_terminal || flight.arrival_terminal || flight.notes) && (
                      <div className="bg-zinc-950/50 rounded-xl p-3 text-xs text-zinc-400 space-y-1">
                        {flight.departure_terminal && <div>Dep Terminal: {flight.departure_terminal}</div>}
                        {flight.arrival_terminal && <div>Arr Terminal: {flight.arrival_terminal}</div>}
                        {flight.notes && <div className="italic mt-1">"{flight.notes}"</div>}
                      </div>
                    )}
                  </div>
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
                  <div key={acc.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                        <Bed className="text-orange-500" size={24} />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-white font-medium">{acc.name}</h4>
                        <p className="text-sm text-zinc-400 mt-1">{acc.address}</p>
                        <div className="flex gap-4 mt-2">
                          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                            In: {format(parseISO(acc.check_in_date), 'MMM d')}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                            Out: {format(parseISO(acc.check_out_date), 'MMM d')}
                          </div>
                        </div>
                      </div>
                    </div>
                    {acc.notes && (
                       <div className="bg-zinc-950/50 rounded-xl p-3 text-xs text-zinc-400 italic">
                         "{acc.notes}"
                       </div>
                    )}
                  </div>
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

        {activeTab === 'settings' && user?.role === 'Admin' && (
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
        {user?.role === 'Admin' && (
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

      {/* Finance Form Modal */}
      <AnimatePresence>
        {isFinanceFormOpen && id && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFlightFormOpen(false)}
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
                onSuccess={() => {
                  setIsFlightFormOpen(false);
                  apiFetch(`/api/trips/${id}/flights`)
                    .then(res => res.json() as Promise<any[]>)
                    .then(data => db.flights.bulkPut(data));
                }} 
                onCancel={() => setIsFlightFormOpen(false)} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Accommodation Form Modal */}
      <AnimatePresence>
        {isAccommodationFormOpen && id && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAccommodationFormOpen(false)}
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
                onSuccess={() => {
                  setIsAccommodationFormOpen(false);
                  apiFetch(`/api/trips/${id}/accommodations`)
                    .then(res => res.json() as Promise<any[]>)
                    .then(data => db.accommodations.bulkPut(data));
                }} 
                onCancel={() => setIsAccommodationFormOpen(false)} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
