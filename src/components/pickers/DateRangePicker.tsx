import React, { useState, useEffect } from 'react';
import { format, isSameDay, differenceInDays, addDays } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Clock, ArrowRight, Plus, Minus } from 'lucide-react';
import { DayPicker, SelectRangeEventHandler, useDayPicker, DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

// 手機數字鍵盤時間輸入
const TimeInput = ({ value, onChange, className }: {
  value: string; onChange: (v: string) => void; className?: string;
}) => (
  <input
    type="text"
    inputMode="numeric"
    pattern="[0-9:]*"
    value={value}
    onChange={e => {
      const d = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
      onChange(d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d);
    }}
    onBlur={e => {
      const parts = e.target.value.split(':');
      if (parts.length === 2 && parts[0] && parts[1]) {
        const h = Math.min(23, parseInt(parts[0]) || 0);
        const m = Math.min(59, parseInt(parts[1]) || 0);
        onChange(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }}
    placeholder="HH:MM"
    className={className}
  />
);

const addHoursToTime = (t: string, hours: number): string => {
  const [h, m] = t.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + Math.round(hours * 60);
  return `${Math.floor(total / 60 % 24).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
};

const hoursFromTimes = (start: string, end: string): number => {
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  return Math.max(0, Math.round((toMins(end) - toMins(start)) / 60 * 10) / 10);
};

interface DateRangePickerProps {
  category?: string;
  value: {
    start_date: Date | null;
    end_date: Date | null;
    start_time?: string;
    end_time?: string;
    pre_start_time?: string;
    daily_start_time?: string;
    daily_end_time?: string;
  };
  onChange: (range: {
    start_date: Date | null;
    end_date: Date | null;
    start_time: string;
    end_time: string;
    pre_start_time?: string;
    daily_start_time?: string;
    daily_end_time?: string;
  }) => void;
  label?: string;
  hideTime?: boolean;
}

export function DateRangePicker({ value, onChange, label, category, hideTime = false }: DateRangePickerProps) {
  const isHotel = category === 'HOTEL';
  const isTransport = ['FLIGHT', 'TRAIN', 'FERRY'].includes(category || '');
  const isRental = ['RENTAL', 'PRIVATE_TRANSFER'].includes(category || '');

  const [isOpen, setIsOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(() =>
    value.start_date || value.end_date ? { from: value.start_date || undefined, to: value.end_date || undefined } : undefined
  );

  const defaultStartTime = isHotel ? '16:00' : '10:00';
  const defaultEndTime = isHotel ? '11:00' : '14:00';

  const [times, setTimes] = useState({
    start: value.start_time || defaultStartTime,
    end: value.end_time || defaultEndTime,
    preStart: value.pre_start_time || '',
    dailyStart: value.daily_start_time || '08:00',
    dailyEnd: value.daily_end_time || '22:00',
  });

  // HOTEL: nights count
  const [nights, setNights] = useState(() => {
    if (value.start_date && value.end_date) return Math.max(1, differenceInDays(value.end_date, value.start_date));
    return 1;
  });

  // RENTAL: hours
  const [rentalHours, setRentalHours] = useState(() => {
    if (value.start_time && value.end_time) return Math.max(1, hoursFromTimes(value.start_time, value.end_time));
    return 8;
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedRange(value.start_date || value.end_date ? { from: value.start_date || undefined, to: value.end_date || undefined } : undefined);
      setTimes({
        start: value.start_time || defaultStartTime,
        end: value.end_time || defaultEndTime,
        preStart: value.pre_start_time || '',
        dailyStart: value.daily_start_time || '08:00',
        dailyEnd: value.daily_end_time || '22:00',
      });
      if (value.start_date && value.end_date) setNights(Math.max(1, differenceInDays(value.end_date, value.start_date)));
    }
  }, [isOpen]);

  // Sync nights → end_date when nights changes
  const handleNightsChange = (n: number) => {
    const newN = Math.max(1, n);
    setNights(newN);
    if (selectedRange?.from) {
      setSelectedRange({ from: selectedRange.from, to: addDays(selectedRange.from, newN) });
    }
  };

  // Sync start_date → end_date based on nights (hotel)
  const handleRangeSelect: SelectRangeEventHandler = (range) => {
    if (!range) { setSelectedRange(undefined); return; }
    if (isHotel && range.from) {
      // Selecting start → auto-set end based on nights
      const to = range.to || addDays(range.from, nights);
      const computedNights = differenceInDays(to, range.from);
      setNights(Math.max(1, computedNights));
      setSelectedRange({ from: range.from, to });
    } else {
      setSelectedRange(range);
    }
  };

  // RENTAL: start_time change → sync end_time
  const handleStartTimeChange = (t: string) => {
    setTimes(prev => ({ ...prev, start: t }));
    if (isRental && t.includes(':') && t.length >= 5) {
      setTimes(prev => ({ ...prev, start: t, end: addHoursToTime(t, rentalHours) }));
    }
  };

  // RENTAL: hours change → sync end_time
  const handleRentalHoursChange = (h: number) => {
    const newH = Math.max(0.5, Math.round(h * 2) / 2);
    setRentalHours(newH);
    if (times.start.includes(':') && times.start.length >= 5) {
      setTimes(prev => ({ ...prev, end: addHoursToTime(prev.start, newH) }));
    }
  };

  const handleConfirm = () => {
    onChange({
      start_date: selectedRange?.from || null,
      end_date: selectedRange?.to || selectedRange?.from || null,
      start_time: times.start,
      end_time: times.end,
      pre_start_time: times.preStart || undefined,
      daily_start_time: times.dailyStart,
      daily_end_time: times.dailyEnd,
    });
    setIsOpen(false);
  };

  const getTimeLabels = () => {
    switch (category) {
      case 'HOTEL': return { start: '入住時間 (Check-in)', end: '退房時間 (Check-out)' };
      case 'RENTAL': return { start: '取車時間', end: '還車時間' };
      case 'PRIVATE_TRANSFER': return { start: '接送時間', end: '抵達時間' };
      case 'FLIGHT': return { start: '起飛時間', end: '降落時間', pre: '報到時間 (Check-in)' };
      case 'TRAIN': return { start: '出發時間', end: '抵達時間', pre: '報到時間' };
      case 'FERRY': return { start: '出發時間', end: '抵達時間', pre: '報到時間' };
      default: return { start: '開始時間', end: '結束時間' };
    }
  };
  const timeLabels = getTimeLabels() as any;

  const displayValue = () => {
    const ft = (t?: string) => t || '--:--';
    if (value.start_date && value.end_date) {
      if (isSameDay(value.start_date, value.end_date)) {
        return (
          <div className="flex flex-col flex-1">
            <span className="font-semibold text-white text-sm">{format(value.start_date, 'yyyy/MM/dd')}</span>
            {!hideTime && <span className="text-xs text-orange-400/90 font-mono mt-0.5">{ft(value.start_time)} → {ft(value.end_time)}</span>}
          </div>
        );
      }
      return (
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-col">
            <span className="font-semibold text-white text-sm">{format(value.start_date, 'yyyy/MM/dd')}</span>
            {!hideTime && <span className="text-xs text-orange-400/90 font-mono mt-0.5">{ft(value.start_time)}</span>}
          </div>
          <ArrowRight size={14} className="text-zinc-600 mx-2" />
          <div className="flex flex-col text-right">
            <span className="font-semibold text-white text-sm">{format(value.end_date, 'yyyy/MM/dd')}</span>
            {!hideTime && <span className="text-xs text-orange-400/90 font-mono mt-0.5">{ft(value.end_time)}</span>}
          </div>
        </div>
      );
    } else if (value.start_date) {
      return (
        <div className="flex flex-col flex-1">
          <span className="font-semibold text-white text-sm">{format(value.start_date, 'yyyy/MM/dd')}</span>
          {!hideTime && <span className="text-xs text-orange-400/90 font-mono mt-0.5">{ft(value.start_time)}</span>}
        </div>
      );
    }
    return <span className="text-zinc-500 font-medium text-sm">選擇日期{hideTime ? '' : '與時間'}...</span>;
  };

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

  const timeInputClass = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white text-center font-mono font-bold text-sm focus:outline-none focus:border-orange-500 transition-colors';

  return (
    <>
      <div className="relative w-full">
        {label && <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">{label}</label>}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full bg-zinc-800/80 border border-zinc-700 rounded-2xl px-4 py-3 text-left flex items-center gap-3 focus:outline-none focus:border-orange-500 transition-colors hover:border-zinc-500"
        >
          <CalendarIcon size={16} className="text-orange-500 shrink-0" />
          <div className="flex-1 w-full">{displayValue()}</div>
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed inset-x-0 bottom-0 z-[150] bg-zinc-900 rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            {/* 標頭 */}
            <div className="flex justify-between items-center px-6 pt-5 pb-3 shrink-0 border-b border-zinc-800">
              <h3 className="text-base font-black text-white">
                {hideTime ? '選擇日期' : '日期與時間'}
              </h3>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 rounded-full">
                <X size={18} />
              </button>
            </div>

            {/* 可捲動內容 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-28">
              <div className="py-4">
                <DayPicker
                  mode="range"
                  selected={selectedRange}
                  onSelect={isHotel ? handleRangeSelect : (r => setSelectedRange(r || undefined))}
                  showOutsideDays
                  numberOfMonths={1}
                  classNames={dayPickerClassNames}
                  styles={{ caption: { color: 'white' } }}
                  components={{
                    Caption: ({ displayMonth }) => {
                      const dp = useDayPicker();
                      return (
                        <div className="flex justify-center py-2 relative items-center">
                          <button onClick={() => { const m = new Date(displayMonth); m.setMonth(m.getMonth() - 1); dp.goToMonth(m); }}
                            className="h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100 absolute left-1">
                            <ChevronLeft className="text-white" size={20} />
                          </button>
                          <h2 className="text-sm font-bold text-white">{format(displayMonth, 'yyyy年 M月')}</h2>
                          <button onClick={() => { const m = new Date(displayMonth); m.setMonth(m.getMonth() + 1); dp.goToMonth(m); }}
                            className="h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100 absolute right-1">
                            <ChevronRight className="text-white" size={20} />
                          </button>
                        </div>
                      );
                    },
                  } as any}
                />
              </div>

              {!hideTime && (
                <div className="space-y-4 border-t border-zinc-800 pt-5">

                  {/* HOTEL: 夜數控制 */}
                  {isHotel && (
                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-orange-400 uppercase tracking-widest">住宿夜數</span>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => handleNightsChange(nights - 1)}
                            className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white hover:bg-zinc-700 transition-colors">
                            <Minus size={14} />
                          </button>
                          <span className="text-xl font-black text-white w-8 text-center">{nights}</span>
                          <button type="button" onClick={() => handleNightsChange(nights + 1)}
                            className="w-8 h-8 rounded-full bg-orange-500 border border-orange-400 flex items-center justify-center text-white hover:bg-orange-600 transition-colors">
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                      {selectedRange?.from && (
                        <p className="text-[10px] text-zinc-500 mt-2">
                          {format(selectedRange.from, 'M/d')} → {format(addDays(selectedRange.from, nights), 'M/d')} （{nights} 晚）
                        </p>
                      )}
                    </div>
                  )}

                  {/* RENTAL: 租用時數 */}
                  {isRental && (
                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-orange-400 uppercase tracking-widest">租用時數</span>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => handleRentalHoursChange(rentalHours - 0.5)}
                            className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white hover:bg-zinc-700">
                            <Minus size={14} />
                          </button>
                          <span className="text-xl font-black text-white w-12 text-center">{rentalHours}h</span>
                          <button type="button" onClick={() => handleRentalHoursChange(rentalHours + 0.5)}
                            className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white hover:bg-orange-600">
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 時間輸入 */}
                  <div className="space-y-3">
                    {/* Transport: 報到時間 (pre_start_time) */}
                    {isTransport && timeLabels.pre && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                          <Clock size={11} /> {timeLabels.pre}
                        </label>
                        <TimeInput value={times.preStart} onChange={t => setTimes(prev => ({ ...prev, preStart: t }))}
                          className={timeInputClass} />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                          <Clock size={11} /> {timeLabels.start}
                        </label>
                        <TimeInput value={times.start} onChange={handleStartTimeChange} className={timeInputClass} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                          <Clock size={11} /> {timeLabels.end}
                        </label>
                        <TimeInput value={times.end} onChange={t => setTimes(prev => ({ ...prev, end: t }))} className={timeInputClass} />
                      </div>
                    </div>

                    {/* HOTEL: 每日離開/返回時間 */}
                    {isHotel && (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                            <Clock size={11} /> 每日離開飯店
                          </label>
                          <TimeInput value={times.dailyStart} onChange={t => setTimes(prev => ({ ...prev, dailyStart: t }))} className={timeInputClass} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                            <Clock size={11} /> 每日返回飯店
                          </label>
                          <TimeInput value={times.dailyEnd} onChange={t => setTimes(prev => ({ ...prev, dailyEnd: t }))} className={timeInputClass} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 固定底部按鈕 */}
            <div className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 px-5 py-4 flex gap-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setIsOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-zinc-800 text-white font-bold hover:bg-zinc-700 transition-colors text-sm">
                取消
              </button>
              <button type="button" onClick={handleConfirm} disabled={!selectedRange?.from}
                className="flex-1 py-3 rounded-2xl bg-orange-500 text-white font-bold hover:bg-orange-600 transition-colors disabled:opacity-40 shadow-lg shadow-orange-500/20 text-sm">
                確認
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
