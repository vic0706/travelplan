import React from 'react';
import { Plus, Plane, Train, Ship, Car, Bed, Bus } from 'lucide-react';
import { isPast, isSameDay, parseISO } from 'date-fns';
import { Expense, Booking } from '../../types';
import { FinanceOverview } from '../../components/widgets/FinanceOverview';
import { BookingCard } from '../../components/cards/BookingCard';

interface InfoTabProps {
  expenses: Expense[];
  tripUsers: any[];
  currency: string;
  bookings: Booking[];
  bookingFilter: string;
  setBookingFilter: (f: string) => void;
  availableBookingCategories: string[];
  canEdit: boolean;
  onAddBooking: () => void;
  onEditBooking: (booking: Booking) => void;
}

const GROUP_CONFIG = [
  { cat: 'FLIGHT',           icon: Plane, label: '機票' },
  { cat: 'TRAIN',            icon: Train, label: '火車 / 高鐵' },
  { cat: 'FERRY',            icon: Ship,  label: '船票' },
  { cat: 'BUS',              icon: Bus,   label: '公車 / 巴士' },
  { cat: 'HOTEL',            icon: Bed,   label: '住宿' },
  { cat: 'RENTAL',           icon: Car,   label: '租車' },
  { cat: 'PRIVATE_TRANSFER', icon: Car,   label: '包車 / 接送' },
] as const;

function sortBookings(list: Booking[]): Booking[] {
  const now = new Date();
  return [...list].sort((a, b) => {
    const dateA = parseISO(`${a.start_date}T${a.start_time || '00:00'}`);
    const dateB = parseISO(`${b.start_date}T${b.start_time || '00:00'}`);
    const aPast = isPast(dateA) && !isSameDay(dateA, now);
    const bPast = isPast(dateB) && !isSameDay(dateB, now);
    if (aPast && !bPast) return 1;
    if (!aPast && bPast) return -1;
    return dateA.getTime() - dateB.getTime();
  });
}

export function InfoTab({
  expenses, tripUsers, currency, bookings, canEdit, onAddBooking, onEditBooking,
}: InfoTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-6">費用總覽</h3>
        <FinanceOverview expenses={expenses} members={tripUsers} currency={currency} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h4 className="text-zinc-500 text-xs font-bold uppercase tracking-widest">訂票資料</h4>
        </div>

        {bookings.length > 0 ? (
          <div className="space-y-6">
            {GROUP_CONFIG.map(({ cat, icon: Icon, label }) => {
              const group = sortBookings(bookings.filter(b => b.category === cat));
              if (group.length === 0) return null;
              return (
                <div key={cat} className="space-y-3">
                  {/* Group header */}
                  <div className="flex items-center gap-2.5 px-1">
                    <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                      <Icon size={13} className="text-orange-400" />
                    </div>
                    <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">{label}</span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>
                  {/* Cards */}
                  <div className="space-y-3">
                    {group.map(booking => (
                      <BookingCard key={booking.id} booking={booking} canEdit={canEdit}
                        onEdit={() => onEditBooking(booking)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-3xl p-12 text-center text-zinc-500">
            <p className="text-sm">尚無訂票資料</p>
          </div>
        )}

        {canEdit && (
          <button
            onClick={onAddBooking}
            className="w-full mt-2 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
          >
            <Plus size={20} /><span className="font-medium">＋ 新增訂票</span>
          </button>
        )}
      </div>
    </div>
  );
}
