import React, { useEffect } from 'react';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, MapPin } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { getApiUrl } from '../utils/api';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

export function Home() {
  // 1. Live Query from IndexedDB (Offline-First)
  const trips = useLiveQuery(() => db.trips.orderBy('start_date').reverse().toArray());
  
  const { user } = useAppStore();
  const navigate = useNavigate();

  // 2. Fetch from API and update IndexedDB (Network-First Strategy for freshness)
  useEffect(() => {
    if (navigator.onLine) {
      fetch(getApiUrl('/api/trips'))
        .then(res => res.json())
        .then(async (data) => {
          if (Array.isArray(data)) {
            // We need to be careful not to overwrite 'is_fully_synced' if it exists locally
            // So we iterate and put one by one or use a more complex merge
            // For simplicity, let's just update the basic info. 
            // Dexie's bulkPut will overwrite the whole object if key matches.
            // To preserve local fields, we should read first.
            
            const existingTrips = await db.trips.toArray();
            const existingMap = new Map(existingTrips.map(t => [t.id, t]));
            
            const tripsToSave = data.map(apiTrip => {
              const localTrip = existingMap.get(apiTrip.id);
              return {
                ...apiTrip,
                is_fully_synced: localTrip?.is_fully_synced, // Preserve sync status
                last_accessed: localTrip?.last_accessed // Preserve access time
              };
            });
            
            await db.trips.bulkPut(tripsToSave);
          }
        })
        .catch(err => console.error('Failed to fetch trips:', err));
    }
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 bg-black min-h-screen">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-semibold text-white tracking-tight">Public Trips</h2>
        {user?.role === 'Admin' && (
          <button className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors shadow-lg shadow-orange-500/20">
            <Plus size={18} />
            <span>New Trip</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {Array.isArray(trips) && trips.length > 0 ? (
          trips.map(trip => {
            const safeParse = (dateStr: any) => {
              if (!dateStr || typeof dateStr !== 'string') return null;
              try {
                const parsed = parseISO(dateStr);
                return isNaN(parsed.getTime()) ? null : parsed;
              } catch (e) {
                return null;
              }
            };

            const validStartDate = safeParse(trip.start_date);
            const validEndDate = safeParse(trip.end_date);
            
            const days = (validStartDate && validEndDate) ? differenceInDays(validEndDate, validStartDate) + 1 : 0;
            const displayStartDate = validStartDate ? format(validStartDate, 'MMM d, yyyy') : 'N/A';

            const imageUrl = trip.cover_image_url && typeof trip.cover_image_url === 'string' && trip.cover_image_url.startsWith('http')
              ? trip.cover_image_url
              : 'https://picsum.photos/seed/default/400/300'; // Fallback image
            
            const timezoneDisplay = (trip.timezone && typeof trip.timezone === 'string') 
              ? (trip.timezone.split('/')[1]?.replace('_', ' ') || trip.timezone)
              : 'Unknown';
            
            return (
              <div
                key={trip.id}
                onClick={() => navigate(`/trip/${trip.id}`)}
                className="group relative overflow-hidden rounded-3xl bg-zinc-900 border border-white/5 cursor-pointer hover:border-orange-500/50 transition-all duration-300 shadow-xl"
              >
                <div className="aspect-[4/3] w-full relative">
                  <img
                    src={imageUrl}
                    alt={trip.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent"></div>
                </div>
                
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="flex items-center gap-2 text-orange-400 mb-2">
                    <MapPin size={16} />
                    <span className="text-xs font-semibold uppercase tracking-wider">{timezoneDisplay}</span>
                  </div>
                  <h3 className="text-2xl font-semibold text-white mb-2 leading-tight">{trip.title}</h3>
                  <div className="flex items-center gap-4 text-zinc-400 text-sm font-medium">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={16} />
                      <span>{displayStartDate}</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-white/10 rounded-md text-white text-xs">
                      <span>{days} Days</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-20 text-zinc-500">
            <p>No trips found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
