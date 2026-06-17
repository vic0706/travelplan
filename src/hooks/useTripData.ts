import { useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { db } from '../db';
import { apiFetch, safeJson } from '../utils/api';
import { parseISO, isPast, isSameDay } from 'date-fns';
import { Trip, Itinerary, Expense, User } from '../types';

// 安全解析日期的輔助函式
const safeParse = (dateStr: any) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  try {
    const parsed = parseISO(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch (e) {
    return null;
  }
};

export function useTripData(tripId: string | undefined) {
  const [isLoading, setIsLoading] = useState(false);
  const { user, _hasHydrated } = useAppStore();

  const refreshTripData = useCallback(async () => {
    const id = Number(tripId);
    if (!id || !navigator.onLine || !_hasHydrated) return;
    
    setIsLoading(true);
    try {
      // 1. 抓取行程基本設定
      const tripRes = await apiFetch(`/api/trips/${id}`);
      if (!tripRes.ok) throw new Error('Trip fetch failed');
      const tripData = await safeJson(tripRes) as Trip;
      
      const tripEndDate = safeParse(tripData.end_date);
      const isPastTrip = tripEndDate && isPast(tripEndDate) && !isSameDay(tripEndDate, new Date());
      const shouldDeepCache = user?.role !== 'Guest' && !isPastTrip;

      await db.trips.put({ ...tripData, last_accessed: Date.now(), is_fully_synced: shouldDeepCache });

      // 2. 並發抓取所有關聯資料 (活動、花費、成員、預訂)
      const [itinerariesRes, expensesRes, membersRes, bookingsRes] = await Promise.all([
        apiFetch(`/api/trips/${id}/itineraries`),
        apiFetch(`/api/trips/${id}/expenses`),
        apiFetch(`/api/trips/${id}/members`),
        apiFetch(`/api/trips/${id}/bookings`)
      ]);

      // 3. 寫入活動 (Itineraries) 並比對刪除舊資料
      if (itinerariesRes.ok) {
        const data = await safeJson(itinerariesRes) as Itinerary[];
        const existingIds = await db.itineraries.where('trip_id').equals(id).primaryKeys();
        const incomingIds = data.map(i => i.id);
        const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid as number));
        await db.transaction('rw', db.itineraries, async () => {
          if (idsToDelete.length > 0) await db.itineraries.bulkDelete(idsToDelete as number[]);
          await db.itineraries.bulkPut(data);
        });
      }

      // 4. 寫入花費 (Expenses) 並比對刪除舊資料
      if (expensesRes.ok) {
        const data = await safeJson(expensesRes) as Expense[];
        const existingIds = await db.expenses.where('trip_id').equals(id).primaryKeys();
        const incomingIds = data.map(e => e.id);
        const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid as number));
        await db.transaction('rw', db.expenses, async () => {
          if (idsToDelete.length > 0) await db.expenses.bulkDelete(idsToDelete as number[]);
          await db.expenses.bulkPut(data);
        });
      }

      // 5. 寫入成員 (Members & Users) 並比對刪除舊資料
      if (membersRes.ok) {
        const data = await safeJson(membersRes) as User[];
        // 確保每個成員都有 ID 才能寫入 IndexedDB
        const validMembers = data.filter(m => m.id);
        await db.users.bulkPut(validMembers.map((m) => ({ id: m.id, name: m.name, role: m.role, avatar_url: m.avatar_url || '', allow_login: 1 })));

        // Also ensure current logged-in user exists in db.users (e.g. admin not in old trip's TripMembers)
        if (user && !validMembers.some(m => m.id === user.id)) {
          await db.users.put({ id: user.id, name: user.name, role: user.role, avatar_url: user.avatar_url || '', allow_login: 1 });
        }

        const existingMembers = await db.tripMembers.where('trip_id').equals(id).toArray();
        const incomingMemberIds = validMembers.map(m => m.id);
        // Preserve current user in tripMembers even if API doesn't return them (e.g. admin)
        const membersToDelete = existingMembers.filter(m => !incomingMemberIds.includes(m.user_id) && m.user_id !== user?.id);

        await db.transaction('rw', db.tripMembers, async () => {
          for (const m of membersToDelete) await db.tripMembers.where({ trip_id: id, user_id: m.user_id }).delete();
          await db.tripMembers.bulkPut(validMembers.map((m) => ({ trip_id: id, user_id: m.id, role: 'Member' })));
          if (user && !validMembers.some(m => m.id === user.id)) {
            await db.tripMembers.put({ trip_id: id, user_id: user.id, role: user.role || 'Admin' });
          }
        });
      }

      // 6. 寫入預訂 (Bookings) 並比對刪除舊資料
      if (bookingsRes.ok) {
        const data = await safeJson(bookingsRes) as any[];
        const existingIds = await db.bookings.where('trip_id').equals(id).primaryKeys();
        const incomingIds = data.map((b: any) => b.id);
        const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid as number));
        await db.transaction('rw', db.bookings, async () => {
          if (idsToDelete.length > 0) await db.bookings.bulkDelete(idsToDelete as number[]);
          await db.bookings.bulkPut(data);
        });
      }
    } catch (err) { 
      console.error('Failed to sync trip details:', err); 
    } finally { 
      setIsLoading(false); 
    }
  }, [tripId, user, _hasHydrated]);

  return { refreshTripData, isLoading };
}