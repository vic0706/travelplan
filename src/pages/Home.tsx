import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, Loader2 } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { apiFetch, safeJson } from '../utils/api';

// ✅ 根據行程標題產生 Unsplash 關鍵字封面圖
// 優先使用用戶上傳的 cover_image_url；若無，則用標題作為 Unsplash 搜尋關鍵字
// 加上 trip.id 作為 seed 確保同一 trip 每次拿到相同圖片
function getTripCoverImage(trip: any, width = 800, height = 600): string {
  if (trip.cover_image_url && typeof trip.cover_image_url === 'string' && trip.cover_image_url.startsWith('http')) {
    return trip.cover_image_url;
  }
  // 用標題當關鍵字，去掉中文字留英文部分，或直接用 travel 作 fallback
  const keyword = encodeURIComponent((trip.title || 'travel').trim());
  return `https://source.unsplash.com/${width}x${height}/?${keyword},travel`;
}

export function Home() {
  const trips = useLiveQuery(() => db.trips.orderBy('start_date').reverse().toArray());
  const { user, _hasHydrated, token, setCreateTripModalOpen } = useAppStore();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!_hasHydrated) {
      setIsLoading(false);
      return;
    }
    const fetchTrips = async () => {
      if (!navigator.onLine) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await apiFetch('/api/trips');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await safeJson<any[]>(res);
        if (Array.isArray(data)) {
          const serverTripIds = new Set(data.map(t => t.id));
          const localTrips = await db.trips.toArray();
          const tripsToDelete = localTrips.filter(t => !serverTripIds.has(t.id));
          if (tripsToDelete.length > 0) await db.trips.bulkDelete(tripsToDelete.map(t => t.id as number));
          await db.trips.bulkPut(data);
        }
      } catch (err: any) {
        console.error('Failed to fetch trips:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTrips();
  }, [_hasHydrated, token]);

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
            const isMember = user && trip.members?.some((member: any) => member.user_id === user.id);
            const canView = trip.is_public || isMember || user?.role === 'Admin';
            if (!canView) return null;

            const validStartDate = trip.start_date ? parseISO(trip.start_date) : null;
            const validEndDate = trip.end_date ? parseISO(trip.end_date) : null;
            const days = (validStartDate && validEndDate) ? differenceInDays(validEndDate, validStartDate) + 1 : 0;
            const displayStartDate = validStartDate ? format(validStartDate, 'MMM d, yyyy') : 'Date TBD';
            // ✅ 改用 Unsplash，以標題作為關鍵字
            const imageUrl = getTripCoverImage(trip, 800, 600);
            
            return (
              <div
                key={trip.id}
                onClick={() => navigate(`/trip/${trip.id}`)}
                className="group relative overflow-hidden rounded-3xl bg-zinc-900 border border-white/5 shadow-xl transition-all duration-300 cursor-pointer hover:border-orange-500/50"
              >
                <div className="aspect-[4/3] w-full relative overflow-hidden">
                  <img src={imageUrl} alt={trip.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent"></div>
                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white border border-white/10">{days} Days</div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h3 className="text-2xl font-bold text-white mb-3 leading-tight drop-shadow-lg">{trip.title}</h3>
                  <div className="flex items-center gap-4 text-zinc-300 text-sm font-medium">
                    <div className="flex items-center gap-1.5"><Calendar size={16} className="text-zinc-400" /><span>{displayStartDate}</span></div>
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

      {/* 💡 首頁懸浮按鈕：開啟全域 Modal */}
      {user?.role === 'Admin' && (
        <button
          onClick={() => setCreateTripModalOpen(true)}
          className="fixed bottom-24 right-6 w-14 h-14 bg-orange-500 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-orange-600 transition-all active:scale-95 z-40 border-4 border-black"
        >
          <Plus size={32} />
        </button>
      )}
    </div>
  );
}