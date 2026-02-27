import React, { useState, useRef, useEffect } from 'react';
import { format, isSameDay, isBefore, isAfter, startOfDay, endOfDay, parseISO } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { DayPicker, SelectRangeEventHandler, useDayPicker, DateRange, CustomComponents } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface DateRangePickerProps {
  value: { start: Date | null; end: Date | null };
  onChange: (range: { start: Date | null; end: Date | null }) => void;
  label?: string;
}

export function DateRangePicker({ value, onChange, label }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>(() => (
    value.start || value.end ? { from: value.start || undefined, to: value.end || undefined } : { from: undefined, to: undefined }
  ));

  const handleSelect: SelectRangeEventHandler = (range) => {
    setSelectedRange(range || { from: undefined, to: undefined });
  };

  const handleConfirm = () => {
    onChange({ start: selectedRange.from || null, end: selectedRange.to || null });
    setIsOpen(false);
  };

  const handleCancel = () => {
    setSelectedRange({ from: value.start || undefined, to: value.end || undefined });
    setIsOpen(false);
  };

  const displayValue = () => {
    if (value.start && value.end) {
      return `${format(value.start, 'yyyy/MM/dd')} ~ ${format(value.end, 'yyyy/MM/dd')}`;
    } else if (value.start) {
      return format(value.start, 'yyyy/MM/dd');
    } else {
      return 'Select dates...';
    }
  };

  // Custom styles for DayPicker
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
      <div className="relative">
        {label && <label className="text-xs text-zinc-500 mb-1 block">{label}</label>}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={clsx(
            "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-left flex items-center gap-3 focus:outline-none focus:border-orange-500",
            !value.start && !value.end ? 'text-zinc-500' : 'text-white'
          )}
        >
          <CalendarIcon size={18} className="text-orange-500" />
          <span>{displayValue()}</span>
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
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">Select Date Range</h3>
              <button onClick={handleCancel} className="text-zinc-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <DayPicker
                mode="range"
                selected={selectedRange}
                onSelect={handleSelect}
                showOutsideDays
                numberOfMonths={window.innerWidth > 768 ? 2 : 1} // Show 2 months on larger screens
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
            </div>

            <div className="mt-6 flex gap-3 pb-safe-bottom pb-8">
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
                disabled={!selectedRange?.from || !selectedRange?.to}
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
