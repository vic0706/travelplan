import React from 'react';
import { Plus } from 'lucide-react';
import { Itinerary, Booking } from '../../types';
import { WeatherWidget } from '../../components/widgets/WeatherWidget';
import { ItineraryCard } from '../../components/cards/ItineraryCard';
import { TransportationCard } from '../../components/cards/TransportationCard';

interface ItineraryTabProps {
  tripId: number;
  selectedDate: Date | null;
  isFutureTrip: boolean;
  filteredItineraries: Itinerary[];
  conflictedIdsInView: Set<number>;
  bookings: Booking[];
  canEdit: boolean;
  expandSignal: number;
  collapseSignal: number;
  isWeatherExpanded: boolean;
  onToggleWeather: () => void;
  onAddActivity: () => void;
  onEditItinerary: (item: Itinerary) => void;
  onEditNextTransport: (item: Itinerary) => void;
  onEditBooking: (booking: Booking) => void;
  onCopyItinerary: (item: Itinerary) => void;
  onChangeDateItinerary: (item: Itinerary) => void;
}

export function ItineraryTab({
  tripId, selectedDate, isFutureTrip, filteredItineraries, conflictedIdsInView,
  bookings, canEdit, expandSignal, collapseSignal,
  isWeatherExpanded, onToggleWeather,
  onAddActivity, onEditItinerary, onEditNextTransport, onEditBooking,
  onCopyItinerary, onChangeDateItinerary,
}: ItineraryTabProps) {
  return (
    <div className="space-y-6">
      <WeatherWidget
        tripId={tripId}
        date={selectedDate}
        isFutureTrip={isFutureTrip}
        controlled={true}
        isExpanded={isWeatherExpanded}
        onToggle={onToggleWeather}
      />

      <div className="space-y-4">
        {filteredItineraries.length > 0 ? (
          filteredItineraries.map((item, index) => {
            if (item.type === 'TRANSPORTATION' && item.related_id) {
              const booking = bookings.find(b => b.id === item.related_id);
              if (booking) {
                return (
                  <TransportationCard
                    key={`transport-${item.id}`}
                    item={item} booking={booking} canEdit={canEdit}
                    isConflicted={conflictedIdsInView.has(item.id)}
                    onEdit={() => onEditBooking(booking)}
                    showNextTransport={index < filteredItineraries.length - 1}
                    onEditNextTransport={() => onEditNextTransport(item)}
                    selectedDate={selectedDate || new Date()}
                    expandSignal={expandSignal} collapseSignal={collapseSignal}
                  />
                );
              }
            }
            // Any item with related_id pointing to a known booking (non-TRANSPORTATION) → BookingForm
            const linkedBooking = item.related_id
              ? bookings.find(b => b.id === item.related_id)
              : undefined;
            const displayItem = linkedBooking && !item.image_url
              ? { ...item, image_url: linkedBooking.image_url || '' }
              : item;
            return (
              <div key={`itinerary-${item.id}`} className="space-y-2">
                <ItineraryCard
                  item={displayItem} canEdit={canEdit}
                  isConflicted={conflictedIdsInView.has(item.id)}
                  onEdit={() => linkedBooking ? onEditBooking(linkedBooking) : onEditItinerary(item)}
                  showNextTransport={index < filteredItineraries.length - 1}
                  onEditNextTransport={() => onEditNextTransport(item)}
                  expandSignal={expandSignal} collapseSignal={collapseSignal}
                  onCopy={() => onCopyItinerary(item)}
                  onChangeDate={() => onChangeDateItinerary(item)}
                />
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
            <p>這天還沒有活動</p>
          </div>
        )}

        {canEdit && (
          <button
            onClick={onAddActivity}
            className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
          >
            <Plus size={20} /><span className="font-medium">＋ 新增活動</span>
          </button>
        )}
      </div>
    </div>
  );
}
