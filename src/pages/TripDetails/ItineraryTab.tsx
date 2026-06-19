import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Itinerary, Booking } from '../../types';
import { WeatherWidget } from '../../components/widgets/WeatherWidget';
import { ItineraryCard } from '../../components/cards/ItineraryCard';
import { StackedItineraryCard } from '../../components/cards/StackedItineraryCard';
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
  defaultSignal: number;
  expandState: 'default' | 'expanded' | 'collapsed';
  isWeatherExpanded: boolean;
  onToggleWeather: () => void;
  onAddActivity: () => void;
  onEditItinerary: (item: Itinerary) => void;
  onEditNextTransport: (item: Itinerary) => void;
  onEditBooking: (booking: Booking) => void;
  onCopyItinerary: (item: Itinerary) => void;
  onChangeDateItinerary: (item: Itinerary) => void;
  onToggleLock: (item: Itinerary) => void;
  onReorder: (orderedItems: Itinerary[]) => Promise<void>;
  backupMap: Map<number, Itinerary[]>;
  onAddBackup: (primary: Itinerary) => void;
  onSwapBackup: (primaryId: number, backupId: number) => void;
  onDeleteBackup: (backupId: number) => void;
}

interface SortableCardProps {
  item: Itinerary;
  backups: Itinerary[];
  index: number;
  displayList: Itinerary[];
  conflictedIdsInView: Set<number>;
  bookings: Booking[];
  canEdit: boolean;
  expandSignal: number;
  collapseSignal: number;
  defaultSignal: number;
  expandState: 'default' | 'expanded' | 'collapsed';
  onEditItinerary: (item: Itinerary) => void;
  onEditNextTransport: (item: Itinerary) => void;
  onEditBooking: (booking: Booking) => void;
  onCopyItinerary: (item: Itinerary) => void;
  onChangeDateItinerary: (item: Itinerary) => void;
  onToggleLock: (item: Itinerary) => void;
  onAddBackup: (primary: Itinerary) => void;
  onSwapBackup: (primaryId: number, backupId: number) => void;
}

function SortableCard({
  item, backups, index, displayList, conflictedIdsInView, bookings, canEdit,
  expandSignal, collapseSignal, defaultSignal, expandState,
  onEditItinerary, onEditNextTransport, onEditBooking,
  onCopyItinerary, onChangeDateItinerary, onToggleLock,
  onAddBackup, onSwapBackup,
}: SortableCardProps) {
  const isLocked = !!(item as any).is_time_fixed;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: isLocked || !canEdit,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const preventSelect = {
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    style: { ...style, WebkitTouchCallout: 'none' as const, WebkitUserSelect: 'none' as const, userSelect: 'none' as const },
  };

  if (item.type === 'TRANSPORTATION' && item.related_id) {
    const booking = bookings.find(b => b.id === item.related_id);
    if (booking) {
      return (
        <div ref={setNodeRef} {...preventSelect} {...attributes} {...listeners}>
          <TransportationCard
            item={item} booking={booking} canEdit={canEdit}
            isConflicted={conflictedIdsInView.has(item.id)}
            onEdit={() => onEditBooking(booking)}
            showNextTransport={index < displayList.length - 1}
            onEditNextTransport={() => onEditNextTransport(item)}
            selectedDate={new Date()}
            expandSignal={expandSignal} collapseSignal={collapseSignal} defaultSignal={defaultSignal}
            expandState={expandState}
          />
        </div>
      );
    }
  }

  return (
    <div
      ref={setNodeRef}
      {...preventSelect}
      {...attributes}
      className="space-y-2"
    >
      <StackedItineraryCard
        item={item}
        backups={backups}
        index={index}
        displayList={displayList}
        conflictedIdsInView={conflictedIdsInView}
        bookings={bookings}
        canEdit={canEdit}
        expandSignal={expandSignal}
        collapseSignal={collapseSignal}
        defaultSignal={defaultSignal}
        expandState={expandState}
        onEditItinerary={onEditItinerary}
        onEditNextTransport={onEditNextTransport}
        onEditBooking={onEditBooking}
        onCopyItinerary={onCopyItinerary}
        onChangeDateItinerary={onChangeDateItinerary}
        onToggleLock={onToggleLock}
        dragHandleListeners={!isLocked && canEdit ? listeners : undefined}
        onAddBackup={onAddBackup}
        onSwapBackup={onSwapBackup}
      />
    </div>
  );
}

export function ItineraryTab({
  tripId, selectedDate, isFutureTrip, filteredItineraries, conflictedIdsInView,
  bookings, canEdit, expandSignal, collapseSignal, defaultSignal, expandState,
  isWeatherExpanded, onToggleWeather,
  onAddActivity, onEditItinerary, onEditNextTransport, onEditBooking,
  onCopyItinerary, onChangeDateItinerary, onToggleLock, onReorder,
  backupMap, onAddBackup, onSwapBackup, onDeleteBackup,
}: ItineraryTabProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [dragCollapseSignal, setDragCollapseSignal] = useState(0);
  const [dragDefaultSignal, setDragDefaultSignal] = useState(0);

  const sensors = useSensors(
    useSensor(MouseSensor,  { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor,  { activationConstraint: { delay: 200, tolerance: 10 } }),
  );

  const itemIds = filteredItineraries.map(i => i.id);
  const activeItem = activeId != null ? filteredItineraries.find(i => i.id === activeId) : null;

  const handleDragStart = ({ active }: any) => {
    setActiveId(active.id as number);
    setDragCollapseSignal(c => c + 1);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    setActiveId(null);
    setDragDefaultSignal(c => c + 1);
    if (!over || active.id === over.id) return;

    const oldIndex = filteredItineraries.findIndex(i => i.id === active.id);
    const newIndex = filteredItineraries.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(filteredItineraries, oldIndex, newIndex));
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setDragDefaultSignal(c => c + 1);
  };

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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              {filteredItineraries.map((item, index) => (
                <SortableCard
                  key={item.id}
                  item={item}
                  backups={backupMap.get(item.id) ?? []}
                  index={index}
                  displayList={filteredItineraries}
                  conflictedIdsInView={conflictedIdsInView}
                  bookings={bookings}
                  canEdit={canEdit}
                  expandSignal={expandSignal}
                  collapseSignal={collapseSignal + dragCollapseSignal}
                  defaultSignal={defaultSignal + dragDefaultSignal}
                  expandState={expandState}
                  onEditItinerary={onEditItinerary}
                  onEditNextTransport={onEditNextTransport}
                  onEditBooking={onEditBooking}
                  onCopyItinerary={onCopyItinerary}
                  onChangeDateItinerary={onChangeDateItinerary}
                  onToggleLock={onToggleLock}
                  onAddBackup={onAddBackup}
                  onSwapBackup={onSwapBackup}
                />
              ))}
            </SortableContext>
            <DragOverlay>
              {activeItem && (
                <ItineraryCard
                  item={activeItem}
                  canEdit={false}
                  onEdit={() => {}}
                  isDragOverlay
                  expandSignal={0} collapseSignal={0} defaultSignal={0}
                  expandState="collapsed"
                />
              )}
            </DragOverlay>
          </DndContext>
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
