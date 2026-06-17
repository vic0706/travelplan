import React, { useState, useEffect } from 'react';
import { Plus, Check, X } from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  onReorder: (orderedItems: Itinerary[]) => void;
}

interface SortableCardProps {
  item: Itinerary;
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
}

function SortableCard({
  item, index, displayList, conflictedIdsInView, bookings, canEdit,
  expandSignal, collapseSignal, defaultSignal, expandState,
  onEditItinerary, onEditNextTransport, onEditBooking,
  onCopyItinerary, onChangeDateItinerary, onToggleLock,
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

  if (item.type === 'TRANSPORTATION' && item.related_id) {
    const booking = bookings.find(b => b.id === item.related_id);
    if (booking) {
      return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
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

  const linkedBooking = item.related_id ? bookings.find(b => b.id === item.related_id) : undefined;
  const displayItem = linkedBooking && !item.image_url
    ? { ...item, image_url: linkedBooking.image_url || '' }
    : item;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(!isLocked && canEdit ? listeners : {})}
      className="space-y-2 touch-none"
    >
      <ItineraryCard
        item={displayItem}
        nextItem={displayList[index + 1]}
        canEdit={canEdit}
        isConflicted={conflictedIdsInView.has(item.id)}
        onEdit={() => linkedBooking ? onEditBooking(linkedBooking) : onEditItinerary(item)}
        showNextTransport={index < displayList.length - 1}
        onEditNextTransport={() => onEditNextTransport(item)}
        expandSignal={expandSignal} collapseSignal={collapseSignal} defaultSignal={defaultSignal}
        expandState={expandState}
        onCopy={() => onCopyItinerary(item)}
        onChangeDate={() => onChangeDateItinerary(item)}
        onToggleLock={() => onToggleLock(item)}
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
}: ItineraryTabProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  // pendingOrder: 暫存拖曳後的新順序，等用戶確認才送出
  const [pendingOrder, setPendingOrder] = useState<Itinerary[] | null>(null);

  // 切換日期時重置 pending
  useEffect(() => {
    setPendingOrder(null);
  }, [selectedDate]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const displayList = pendingOrder ?? filteredItineraries;
  const itemIds = displayList.map(i => i.id);
  const activeItem = activeId != null ? displayList.find(i => i.id === activeId) : null;

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = displayList.findIndex(i => i.id === active.id);
    const newIndex = displayList.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    setPendingOrder(arrayMove(displayList, oldIndex, newIndex));
  };

  const handleConfirmSort = () => {
    if (pendingOrder) {
      onReorder(pendingOrder);
      setPendingOrder(null);
    }
  };

  const handleCancelSort = () => {
    setPendingOrder(null);
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
        {/* 排序確認列 */}
        {pendingOrder && (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl bg-zinc-900 border border-orange-500/30">
            <span className="text-[12px] text-zinc-400">順序已調整，確認後儲存</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelSort}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 text-[11px] font-bold hover:bg-zinc-700 transition-colors"
              >
                <X size={12} />取消
              </button>
              <button
                onClick={handleConfirmSort}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-500 text-white text-[11px] font-bold hover:bg-orange-400 transition-colors"
              >
                <Check size={12} />確認排序
              </button>
            </div>
          </div>
        )}

        {displayList.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setActiveId(active.id as number)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              {displayList.map((item, index) => (
                <SortableCard
                  key={item.id}
                  item={item}
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
