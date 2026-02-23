import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, MapPin } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';

export function Home() {
  const [trips, setTrips] = useState<any[]>([]);
  const { user } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/trips')
      .then(res => res.json())
      .then(data => setTrips(data));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 bg-zinc-950 min-h-screen">
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
        {trips.map(trip => {
          const days = differenceInDays(parseISO(trip.end_date), parseISO(trip.start_date)) + 1;
          
          return (
            <div
              key={trip.id}
              onClick={() => navigate(`/trip/${trip.id}`)}
              className="group relative overflow-hidden rounded-3xl bg-zinc-900 border border-white/5 cursor-pointer hover:border-orange-500/50 transition-all duration-300 shadow-xl"
            >
              <div className="aspect-[4/3] w-full relative">
                <img
                  src={trip.cover_image_url}
                  alt={trip.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent"></div>
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="flex items-center gap-2 text-orange-400 mb-2">
                  <MapPin size={16} />
                  <span className="text-xs font-semibold uppercase tracking-wider">{trip.timezone.split('/')[1]?.replace('_', ' ')}</span>
                </div>
                <h3 className="text-2xl font-semibold text-white mb-2 leading-tight">{trip.title}</h3>
                <div className="flex items-center gap-4 text-zinc-400 text-sm font-medium">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={16} />
                    <span>{format(parseISO(trip.start_date), 'MMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-white/10 rounded-md text-white text-xs">
                    <span>{days} Days</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
