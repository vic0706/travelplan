import React, { useState, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Clock, ArrowRight } from 'lucide-react';
import { DayPicker, SelectRangeEventHandler, useDayPicker, DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface DateRangePickerProps {
  category?: string;
  value: { 
    start_date: Date | null; 
    end_date: Date | null;
    start_time?: string;
    end_time?: string;
    daily_start_time?: string;
    daily_end_time?: string;
  };
  onChange: (range: { 
    start_date: Date | null; 
    end_date: Date | null;
    start_time: string;
    end_time: string;
    daily_start_time?: string;
    daily_end_time?: string;
  }) => void;
  label?: string;
}

export function DateRangePicker({ value, onChange, label, category }: DateRangePickerProps) {
  const isHotel = category === 'HOTEL';
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(() => (
    value.start_date || value.end_date ? { from: value.start_date || undefined, to: value.end_date || undefined } : { from: undefined, to: undefined }
  ));

  const [times, setTimes] = useState({
    start: value.start_time || (isHotel ? '16:00' : '10:00'),
    end: value.end_time || (isHotel ? '11:00' : '14:00'),
    dailyStart: value.daily_start_time || '08:00',
    dailyEnd: value.daily_end_time || '22:00'
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedRange(value.start_date || value.end_date ? { from: value.start_date || undefined, to: value.end_date || undefined } : undefined);
      setTimes({
        start: value.start_time || (isHotel ? '16:00' : '10:00'),
        end: value.end_time || (isHotel ? '11:00' : '14:00'),
        dailyStart: value.daily_start_time || '08:00',
        dailyEnd: value.daily_end_time || '22:00'
      });
    }
  }, [isOpen, value, isHotel]);

  const handleSelect: SelectRangeEventHandler = (range) => {
    setSelectedRange(range || { from: undefined, to: undefined });
  };

  const handleConfirm = () => {
    const finalEnd = selectedRange?.to || selectedRange?.from || null;
    onChange({ 
      start_date: selectedRange?.from || null, 
      end_date: finalEnd,
      start_time: times.start,
      end_time: times.end,
      daily_start_time: times.dailyStart,
      daily_end_time: times.dailyEnd
    });
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  // 精緻化按鈕顯示內容 (支援跨日排版)
  const displayValue = () => {
    const formatTime = (t?: string) => t || '--:--';
    
    if (value.start_date && value.end_date) {
      if (isSameDay(value.start_date, value.end_date)) {
         return (
           <div className="flex flex-col flex-1">
             <span className="font-semibold text-white tracking-wide">{format(value.start_date, 'yyyy/MM/dd')}</span>
             <span className="text-xs text-orange-400/90 font-mono mt-0.5">{formatTime(value.start_time)} ~ {formatTime(value.end_time)}</span>
           </div>
         );
      }
      return (
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-col flex-1">
            <span className="font-semibold text-white text-sm">{format(value.start_date, 'yyyy/MM/dd')}</span>
            <span className="text-xs text-orange-400/90 font-mono mt-0.5">{formatTime(value.start_time)}</span>
          </div>
          <div className="shrink-0 text-zinc-600 px-3">
            <ArrowRight size={14} />
          </div>
          <div className="flex flex-col flex-1 text-right">
            <span className="font-semibold text-white text-sm">{format(value.end_date, 'yyyy/MM/dd')}</span>
            <span className="text-xs text-orange-400/90 font-mono mt-0.5">{formatTime(value.end_time)}</span>
          </div>
        </div>
      );
    } else if (value.start_date) {
      return (
        <div className="flex flex-col flex-1">
          <span className="font-semibold text-white">{format(value.start_date, 'yyyy/MM/dd')}</span>
          <span className="text-xs text-orange-400/90 font-mono mt-0.5">{formatTime(value.start_time)} ~ </span>
        </div>
      );
    } else {
      return <span className="text-zinc-500 font-medium">Select dates & times...</span>;
    }
  };

  const getTimeLabels = () => {
    switch (category) {
      case 'HOTEL': return { start: 'Check-in Time', end: 'Check-out Time' };
      case 'RENTAL': return { start: 'Pick-up Time', end: 'Return Time' };
      case 'FLIGHT': return { start: 'Departure Time', end: 'Arrival Time' };
      case 'TRAIN': return { start: 'Departure Time', end: 'Arrival Time' };
      case 'FERRY': return { start: 'Departure Time', end: 'Arrival Time' };
      default: return { start: 'Start Time', end: 'End Time' };
    }
  };

  const timeLabels = getTimeLabels();

  const dayPickerClassNames = {
    months: 'flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4',
    month: 'space-y-4',
    caption: 'flex justify-center py-2 relative items-center',
    caption_label: 'text-sm font-medium text-white',
    nav: 'space-x-1 flex items-center',
    nav_button: 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
    nav_button_previous: 'absolute left-1',
    nav_button_next: 'absolute right-1',
    table: 'w-full border-collapse space-y-1',
    head_row: 'flex',
    head_cell: 'text-zinc-500 rounded-md w-9 font-normal text-[0.8rem]',
    row: 'flex w-full mt-2',
    cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].range-start)]:rounded-l-full [&:has([aria-selected].range-end)]:rounded-r-full [&:has([aria-selected].range-middle)]:rounded-none [&:has([aria-selected].range-start)]:bg-orange-500/20 [&:has([aria-selected].range-end)]:bg-orange-500/20 [&:has([aria-selected].range-middle)]:bg-orange-500/20 first:[&:has([aria-selected])]:rounded-l-full last:[&:has([aria-selected])]:rounded-r-full focus-within:relative focus-within:z-20',
    day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
    day_range_start: 'day-range-start bg-orange-500 text-white rounded-l-full',
    day_range_end: 'day-range-end bg-orange-500 text-white rounded-r-full',
    day_range_middle: 'day-range-middle bg-orange-500/20 text-white rounded-none',
    day_selected: 'bg-orange-500 text-white',
    day_today: 'text-orange-500',
    day_outside: 'text-zinc-500 opacity-50',
    day_disabled: 'text-zinc-700 opacity-50',
    day_hidden: 'invisible',
    day_range_middle_selected: 'bg-orange-500/20',
  };

  return (
    <>
      <div className="relative w-full">
        {label && <label className="text-xs text-zinc-500 mb-1 block">{label}</label>}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-left flex items-center gap-3 focus:outline-none focus:border-orange-500 transition-colors"
        >
          <CalendarIcon size={18} className="text-orange-500 shrink-0" />
          <div className="flex-1 w-full">{displayValue()}</div>
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-x-0 bottom-0 z-[150] bg-zinc-900 rounded-t-3xl shadow-lg p-6 flex flex-col max-h-[90vh]"
          >
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h3 className="text-xl font-semibold text-white">Select Schedule</h3>
              <button onClick={handleCancel} className="text-zinc-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            {/* 加入 pb-24 確保最底下的時間選擇器不會被裁切 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-24">
              <DayPicker
                mode="range"
                selected={selectedRange}
                onSelect={handleSelect}
                showOutsideDays
                numberOfMonths={window.innerWidth > 768 ? 2 : 1}
                classNames={dayPickerClassNames}
                styles={{
                  caption: { color: 'white' },
                  nav_button: { color: 'white' },
                  nav_button_next: { color: 'white' },
                  nav_button_previous: { color: 'white' },
                }}
                components={{
                  Caption: ({ displayMonth }) => {
                    const dayPicker = useDayPicker();
                    return (
                      <div className="flex justify-center py-2 relative items-center">
                        <button
                          onClick={() => {
                            const newMonth = new Date(displayMonth);
                            newMonth.setMonth(newMonth.getMonth() - 1);
                            dayPicker.goToMonth(newMonth);
                          }}
                          className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute left-1"
                        >
                          <ChevronLeft className="text-white" size={20} />
                        </button>
                        <h2 className="text-sm font-medium text-white">
                          {format(displayMonth, 'MMMM yyyy')}
                        </h2>
                        <button
                          onClick={() => {
                            const newMonth = new Date(displayMonth);
                            newMonth.setMonth(newMonth.getMonth() + 1);
                            dayPicker.goToMonth(newMonth);
                          }}
                          className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 absolute right-1"
                        >
                          <ChevronRight className="text-white" size={20} />
                        </button>
                      </div>
                    );
                  },
                } as any}
              />

              <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock size={12} /> {timeLabels.start}
                    </label>
                    <input
                      type="time"
                      value={times.start}
                      onChange={e => setTimes({ ...times, start: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock size={12} /> {timeLabels.end}
                    </label>
                    <input
                      type="time"
                      value={times.end}
                      onChange={e => setTimes({ ...times, end: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
                    />
                  </div>
                </div>

                {isHotel && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={12} /> Daily Leave Time
                      </label>
                      <input
                        type="time"
                        value={times.dailyStart}
                        onChange={e => setTimes({ ...times, dailyStart: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={12} /> Daily Return Time
                      </label>
                      <input
                        type="time"
                        value={times.dailyEnd}
                        onChange={e => setTimes({ ...times, dailyEnd: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors [color-scheme:dark]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 固定在底部的按鈕區塊 */}
            <div className="absolute bottom-0 left-0 right-0 bg-zinc-900 p-6 pt-4 border-t border-zinc-800 flex gap-3 pb-safe-bottom">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 py-3 rounded-xl bg-zinc-800 text-white font-medium hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!selectedRange?.from}
                className="flex-1 py-3 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}