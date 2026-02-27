import React, { useState, useEffect } from 'react';
import { Clock as ClockIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface TimeRangePickerProps {
  value: { start: string; end: string }; // e.g., "07:00"
  onChange: (range: { start: string; end: string }) => void;
  label?: string;
}

export function TimeRangePicker({ value, onChange, label }: TimeRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [startTime, setStartTime] = useState(value.start);
  const [endTime, setEndTime] = useState(value.end);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStartTime(value.start);
    setEndTime(value.end);
  }, [value]);

  const handleConfirm = () => {
    if (startTime && endTime && startTime >= endTime) {
      setError('Start time cannot be later than or equal to end time.');
      return;
    }
    setError(null);
    onChange({ start: startTime, end: endTime });
    setIsOpen(false);
  };

  const handleCancel = () => {
    setError(null);
    setStartTime(value.start);
    setEndTime(value.end);
    setIsOpen(false);
  };

  const displayValue = () => {
    if (value.start && value.end) {
      return `${value.start} ~ ${value.end}`;
    } else if (value.start) {
      return value.start;
    } else {
      return 'Select time...';
    }
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
          <ClockIcon size={18} className="text-orange-500" />
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
              <h3 className="text-xl font-semibold text-white">Select Time Range</h3>
              <button onClick={handleCancel} className="text-zinc-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
              {error && (
                <div className="bg-red-500/10 text-red-500 p-3 rounded-xl text-sm">
                  {error}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label htmlFor="start-time" className="text-sm font-medium text-zinc-400">Start Time</label>
                <input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white text-lg focus:outline-none focus:border-orange-500"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="end-time" className="text-sm font-medium text-zinc-400">End Time</label>
                <input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white text-lg focus:outline-none focus:border-orange-500"
                />
              </div>
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
                disabled={!startTime || !endTime}
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
