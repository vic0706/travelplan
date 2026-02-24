import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { format, parseISO, addDays, differenceInDays, isSameDay, isPast } from 'date-fns';
import { MapPin, Clock, Plus, Navigation, DollarSign, Plane, Bed, Map, Info, Wallet, ArrowLeft, Calendar, X } from 'lucide-react';
import { Trip, Itinerary, Expense, User } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { clsx } from 'clsx';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getApiUrl, apiFetch } from '../utils/api';
import { FinanceForm } from '../components/FinanceForm';
import { motion, AnimatePresence } from 'framer-motion';

export function TripDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAppStore();
  
  // 1. Live Query from IndexedDB (Offline-First)
  const trip = useLiveQuery(() => db.trips.get(Number(id) || 0), [id]);
  const itineraries = useLiveQuery(() => db.itineraries.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const expenses = useLiveQuery(() => db.expenses.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];
  const members = useLiveQuery(() => db.tripMembers.where('trip_id').equals(Number(id) || 0).toArray(), [id]) || [];

  const [activeTab, setActiveTab] = useState<'itinerary' | 'info' | 'finance'>('itinerary');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [isFinanceFormOpen, setIsFinanceFormOpen] = useState(false);

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
    if (!id || !navigator.onLine) return;

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

        const [itinerariesRes, expensesRes, membersRes] = await Promise.all([
          apiFetch(`/api/trips/${id}/itineraries`),
          apiFetch(`/api/trips/${id}/expenses`),
          apiFetch(`/api/trips/${id}/members`)
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

      } catch (err) {
        console.error('Failed to sync trip details:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTripDetails();
  }, [id, user?.role]);

  // Update selectedDate when trip loads
  useEffect(() => {
    if (trip?.start_date) {
      const parsedStart = safeParse(trip.start_date);
      if (parsedStart) {
        setSelectedDate(parsedStart);
      }
    }
  }, [trip?.start_date]);

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
    : 'https://picsum.photos/seed/trip-details/1920/1080';

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

  const COLORS = ['#f97316', '#fb923c', '#fdba74', '#ffedd5'];

  // Better approach for user names:
  // We can fetch all users involved in this trip.
  const tripUsers = useLiveQuery(async () => {
    if (!id) return [];
    const members = await db.tripMembers.where('trip_id').equals(Number(id)).toArray();
    const userIds = members.map(m => m.user_id);
    return db.users.where('id').anyOf(userIds).toArray();
  }, [id]);

  const getUserNameById = (userId: number) => {
    const u = tripUsers?.find(u => u.id === userId);
    return u ? u.name : `User ${userId}`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-black pb-24">
      {/* Trip Header */}
      <div className="relative h-48 w-full overflow-hidden">
        <img 
          src={tripCoverImageUrl} 
          alt={trip.title} 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
        <button 
          onClick={() => navigate('/')}
          className="absolute top-4 left-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-colors z-10"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h1 className="text-2xl font-bold text-white mb-1 drop-shadow-md">{trip.title}</h1>
          <div className="flex items-center gap-3 text-zinc-300 text-sm">
            <div className="flex items-center gap-1">
              <Calendar size={14} />
              <span>{validTripStartDate ? format(validTripStartDate, 'MMM d') : ''} - {validTripEndDate ? format(validTripEndDate, 'MMM d, yyyy') : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Date Slider */}
      {(activeTab === 'itinerary' || activeTab === 'finance') && (
        <div className="sticky top-0 z-20 bg-black/95 backdrop-blur-sm border-b border-zinc-800 py-3 px-4">
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex items-center justify-between shadow-lg">
              <div>
                <h4 className="text-white font-medium mb-1">Weather Forecast</h4>
                <p className="text-sm text-zinc-400">Tokyo, Japan</p>
              </div>
              <div className="flex gap-4">
                <div className="text-center">
                  <div className="text-2xl font-light text-white">18°</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">High</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-light text-zinc-500">12°</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">Low</div>
                </div>
              </div>
            </div>

            {/* Itinerary Cards */}
            <div className="space-y-4">
              {filteredItineraries.length > 0 ? (
                filteredItineraries.map((item, index) => {
                  const itineraryImageUrl = item.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('http')
                    ? item.image_url
                    : null;

                  return (
                    <React.Fragment key={item.id}>
                      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-lg group">
                        {itineraryImageUrl && (
                          <div className="h-32 w-full relative">
                            <img src={itineraryImageUrl} alt={item.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 to-transparent"></div>
                          </div>
                        )}
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full">
                              <Clock size={14} />
                              <span className="text-xs font-bold tracking-wider">{item.start_time} - {item.end_time}</span>
                            </div>
                            {item.tags && item.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 border border-zinc-700 px-2 py-0.5 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <h3 className="text-xl font-semibold text-white mb-2">{item.title}</h3>
                          <div className="flex items-start gap-2 text-zinc-400 text-sm">
                            <MapPin size={16} className="mt-0.5 shrink-0" />
                            <span className="leading-snug">{item.address}</span>
                          </div>
                          {item.notes && (
                            <p className="mt-4 text-sm text-zinc-500 leading-relaxed bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              ) : (
                <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
                  <p>No activities for this day.</p>
                </div>
              )}

              {user?.role !== 'Guest' && (
                <button className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all">
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
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {expenseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                  <Plane className="text-orange-500" size={24} />
                </div>
                <div>
                  <h4 className="text-white font-medium">Flight Details</h4>
                  <p className="text-sm text-zinc-400 mt-1">NRT • Terminal 2</p>
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                  <Bed className="text-orange-500" size={24} />
                </div>
                <div>
                  <h4 className="text-white font-medium">Accommodation</h4>
                  <p className="text-sm text-zinc-400 mt-1">Shinjuku Prince Hotel</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="space-y-4">
            {filteredExpenses.length > 0 ? (
              filteredExpenses.map(expense => (
                <div key={expense.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg flex items-center justify-between">
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

            {user?.role !== 'Guest' && (
              <button 
                onClick={() => setIsFinanceFormOpen(true)}
                className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
              >
                <Plus size={20} />
                <span className="font-medium">Add Expense</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Tabs */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-around px-4 pb-[env(safe-area-inset-bottom)] z-50">
        <button
          onClick={() => setActiveTab('itinerary')}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
            activeTab === 'itinerary' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Map size={24} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Itinerary</span>
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
            activeTab === 'info' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Info size={24} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Info</span>
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          className={clsx(
            "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
            activeTab === 'finance' ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Wallet size={24} />
          <span className="text-[10px] font-medium uppercase tracking-wider">Finance</span>
        </button>
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
    </div>
  );
}
