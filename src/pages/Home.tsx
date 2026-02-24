import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, MapPin, Loader2 } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getApiUrl } from '../utils/api';

export function Home() {
  // 1. Live Query from IndexedDB (Offline-First)
  const trips = useLiveQuery(() => db.trips.orderBy('start_date').reverse().toArray());
  
  const { user } = useAppStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2. Fetch from API and update IndexedDB (Network-First Strategy for freshness)
  useEffect(() => {
    const fetchTrips = async () => {
      if (!navigator.onLine) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(getApiUrl('/api/trips'));
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error('API returned non-JSON:', text.substring(0, 100));
          throw new Error('API returned non-JSON response (likely HTML)');
        }

        if (Array.isArray(data)) {
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
      } catch (err: any) {
        console.error('Failed to fetch trips:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrips();
  }, []);

  if (isLoading && !trips?.length) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 bg-black min-h-screen">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-500 text-sm mb-4">
          Failed to load trips: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.isArray(trips) && trips.length > 0 ? (
          trips.map(trip => {
            let validStartDate: Date | null = null;
            let validEndDate: Date | null = null;
            
            try {
              if (trip.start_date) validStartDate = parseISO(trip.start_date);
              if (trip.end_date) validEndDate = parseISO(trip.end_date);
            } catch (e) {
              console.warn('Invalid date format for trip:', trip.id);
            }
            
            const days = (validStartDate && validEndDate && !isNaN(validStartDate.getTime()) && !isNaN(validEndDate.getTime())) 
              ? differenceInDays(validEndDate, validStartDate) + 1 
              : 0;
              
            const displayStartDate = (validStartDate && !isNaN(validStartDate.getTime())) 
              ? format(validStartDate, 'MMM d, yyyy') 
              : 'Date TBD';

            const imageUrl = trip.cover_image_url && trip.cover_image_url.startsWith('http')
              ? trip.cover_image_url
              : `https://picsum.photos/seed/${trip.id}/800/600`;
            
            return (
              <div
                key={trip.id}
                onClick={() => navigate(`/trip/${trip.id}`)}
                className="group relative overflow-hidden rounded-3xl bg-zinc-900 border border-white/5 cursor-pointer hover:border-orange-500/50 transition-all duration-300 shadow-xl"
              >
                <div className="aspect-[4/3] w-full relative overflow-hidden">
                  <img
                    src={imageUrl}
                    alt={trip.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/fallback/800/600';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent"></div>
                  
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white border border-white/10">
                    {days} Days
                  </div>
                </div>
                
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h3 className="text-2xl font-bold text-white mb-3 leading-tight drop-shadow-lg">{trip.title}</h3>
                  <div className="flex items-center gap-4 text-zinc-300 text-sm font-medium">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={16} className="text-zinc-400" />
                      <span>{displayStartDate}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          !isLoading && (
            <div className="col-span-full text-center py-20 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
              <p>No trips found. Create one to get started!</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
