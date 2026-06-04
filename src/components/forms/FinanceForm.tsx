import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store';
import { apiFetch } from '../../utils/api';
import { format, parseISO, addDays } from 'date-fns';
import { Loader2, X, Delete, Check, ChevronDown } from 'lucide-react';
import { DynamicIcon } from '../common/DynamicIcon';
import { User } from '../../types';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface FinanceFormProps {
  tripId: string;
  defaultDate?: string;
  currencies?: string[];
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: any;
}

// ── Inline date-time wheel ─────────────────────────────────────────────
function DateTimeWheel({
  date, hour, minute, onDateChange, onHourChange, onMinuteChange, centerDate,
}: {
  date: string; hour: number; minute: number;
  onDateChange: (d: string) => void;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  centerDate: string;
}) {
  const dates = Array.from({ length: 29 }, (_, i) => {
    const d = addDays(parseISO(centerDate), i - 14);
    return format(d, 'yyyy-MM-dd');
  });
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  const ITEM_H = 44;
  const VISIBLE = 5;
  const HEIGHT = ITEM_H * VISIBLE;
  const PAD = ITEM_H * 2;

  function WheelCol<T>({
    items, selected, getLabel, onSelect, className,
  }: {
    items: T[]; selected: T; getLabel: (v: T) => string;
    onSelect: (v: T) => void; className?: string;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    const selectedIdx = items.indexOf(selected);

    useEffect(() => {
      if (ref.current) {
        ref.current.scrollTop = selectedIdx * ITEM_H;
      }
    }, [selectedIdx]);

    const handleScroll = () => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      if (items[clamped] !== selected) onSelect(items[clamped]);
    };

    return (
      <div className={clsx('relative flex-1 overflow-hidden', className)}>
        {/* selection highlight */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-10 border-t border-b border-orange-500/50 bg-orange-500/5"
          style={{ top: PAD, height: ITEM_H }}
        />
        <div
          ref={ref}
          className="overflow-y-auto no-scrollbar snap-y snap-mandatory"
          style={{ height: HEIGHT }}
          onScroll={handleScroll}
        >
          {/* top padding */}
          <div style={{ height: PAD }} />
          {items.map((item, i) => (
            <div
              key={i}
              className={clsx(
                'flex items-center justify-center snap-center cursor-pointer transition-all select-none',
                items[selectedIdx] === item
                  ? 'text-orange-400 font-bold text-base'
                  : 'text-zinc-500 text-sm'
              )}
              style={{ height: ITEM_H }}
              onClick={() => onSelect(item)}
            >
              {getLabel(item)}
            </div>
          ))}
          {/* bottom padding */}
          <div style={{ height: PAD }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-stretch bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800" style={{ height: ITEM_H * VISIBLE }}>
      <WheelCol
        items={dates}
        selected={date}
        getLabel={d => format(parseISO(d), 'EEE, MMM d')}
        onSelect={onDateChange}
        className="flex-[2]"
      />
      <div className="w-px bg-zinc-800" />
      <WheelCol
        items={hours}
        selected={hour}
        getLabel={h => h.toString().padStart(2, '0')}
        onSelect={onHourChange}
      />
      <div className="flex items-center justify-center text-zinc-600 font-bold text-lg w-4">:</div>
      <WheelCol
        items={minutes}
        selected={minute}
        getLabel={m => m.toString().padStart(2, '0')}
        onSelect={onMinuteChange}
      />
    </div>
  );
}

// ── Category picker modal ──────────────────────────────────────────────
function CategoryModal({
  categories, selected, onSelect, onClose,
}: {
  categories: any[]; selected: string;
  onSelect: (name: string) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 36 }}
        className="bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-6 w-full max-w-lg pb-10"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">Select Category</h3>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto no-scrollbar">
          {categories.map((c: any) => (
            <button
              key={c.id}
              onClick={() => { onSelect(c.name); onClose(); }}
              className={clsx(
                'flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all',
                selected === c.name
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-600'
              )}
            >
              <DynamicIcon name={c.icon} size={28} />
              <span className="text-xs font-bold text-center leading-tight">{c.name}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export function FinanceForm({ tripId, defaultDate, currencies = ['TWD'], onSuccess, onCancel, initialData }: FinanceFormProps) {
  const { user, categories } = useAppStore();
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const centerDate = defaultDate || today;

  const [itemName, setItemName] = useState(initialData?.item_name || '');
  const [date, setDate] = useState(initialData?.date || defaultDate || today);
  const [selectedHour, setSelectedHour] = useState(() => {
    if (initialData?.date) return new Date().getHours();
    return new Date().getHours();
  });
  const [selectedMinute, setSelectedMinute] = useState(() => {
    const m = new Date().getMinutes();
    return Math.round(m / 5) * 5 % 60;
  });
  const [category, setCategory] = useState(initialData?.category || 'Food');
  const [payerId, setPayerId] = useState<number>(initialData?.payer_id || user?.id || 0);
  const [splitMembers, setSplitMembers] = useState<number[]>(initialData?.split_members || []);
  const [amountStr, setAmountStr] = useState(initialData?.amount?.toString() || '0');
  const [currency, setCurrency] = useState(initialData?.currency || currencies[0] || 'TWD');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPayerModalOpen, setIsPayerModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      try {
        const membersRes = await apiFetch(`/api/trips/${tripId}/members`);
        if (membersRes.ok) {
          const data = await membersRes.json() as User[];
          setMembers(data);
          if (!initialData) {
            setSplitMembers(data.map(m => m.id));
            if (!payerId && data.length > 0) setPayerId(data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch members', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, [tripId]);

  useEffect(() => {
    if (!initialData && categories.length > 0) {
      setCategory(categories.find((c: any) => c.is_default)?.name || categories[0].name);
    }
  }, [categories, initialData]);

  const handleDigit = (digit: string) => {
    if (amountStr === '0' && digit !== '.') {
      setAmountStr(digit);
    } else {
      if (digit === '.' && amountStr.includes('.')) return;
      setAmountStr(prev => prev + digit);
    }
  };

  const handleBackspace = () => {
    setAmountStr(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
  };

  const handleClear = () => setAmountStr('0');

  const handleSubmit = async () => {
    if (!itemName || parseFloat(amountStr) === 0) return;
    setSubmitting(true);
    try {
      const endpoint = initialData ? `/api/trips/${tripId}/expenses/${initialData.id}` : `/api/trips/${tripId}/expenses`;
      const method = initialData ? 'PUT' : 'POST';
      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify({
          item_name: itemName,
          amount: parseFloat(amountStr),
          currency,
          date,
          category,
          payer_id: payerId,
          split_members: splitMembers,
          notes: ''
        })
      });
      if (!res.ok) throw new Error('Failed to save expense');
      onSuccess();
    } catch (err) {
      console.error(err);
      alert('Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!initialData) return;
    setSubmitting(true);
    setShowDeleteConfirm(false);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/expenses/${initialData.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      onSuccess();
    } catch (err) {
      alert('Failed to delete');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSplitMember = (id: number) => {
    setSplitMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const selectedCategory = categories.find((c: any) => c.name === category);

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-zinc-950">
      <Loader2 className="animate-spin text-orange-500" size={32} />
    </div>
  );

  return (
    <>
      <div className="bg-zinc-950 flex flex-col h-full" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-zinc-800 flex items-center justify-between shrink-0" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <button onClick={onCancel} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} />
          </button>
          <h3 className="text-base font-bold text-white">{initialData ? 'Edit Expense' : 'Add Expense'}</h3>
          <div className="flex gap-2">
            {initialData && (
              <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors">
                <Delete size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Date-Time Wheel */}
        <div className="px-4 pt-3 pb-2 shrink-0">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Date &amp; Time</p>
          <DateTimeWheel
            date={date}
            hour={selectedHour}
            minute={selectedMinute}
            onDateChange={setDate}
            onHourChange={setSelectedHour}
            onMinuteChange={setSelectedMinute}
            centerDate={centerDate}
          />
        </div>

        {/* Description */}
        <div className="px-4 pt-1 pb-2 shrink-0">
          <input
            type="text"
            value={itemName}
            onChange={e => setItemName(e.target.value)}
            placeholder="Description..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
          />
        </div>

        {/* Category + Paid By + Split */}
        <div className="px-4 pb-2 flex items-center gap-3 shrink-0">
          {/* Category: single icon, tap to change */}
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/25 border border-orange-400/50 shrink-0 active:scale-95 transition-all"
            title={category}
          >
            {selectedCategory
              ? <DynamicIcon name={selectedCategory.icon} size={26} />
              : <DynamicIcon name="tag" size={26} />
            }
          </button>

          {/* Paid By */}
          <button
            onClick={() => setIsPayerModalOpen(true)}
            className="flex-1 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2 text-left hover:border-zinc-700 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700">
              <img
                src={members.find(m => m.id === payerId)?.avatar_url || `https://ui-avatars.com/api/?name=${members.find(m => m.id === payerId)?.name || '?'}`}
                alt="Payer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Paid By</div>
              <div className="text-xs font-bold text-white truncate">{members.find(m => m.id === payerId)?.name || '—'}</div>
            </div>
          </button>

          {/* Split With */}
          <button
            onClick={() => setIsSplitModalOpen(true)}
            className="flex-1 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2 text-left hover:border-zinc-700 transition-colors"
          >
            <div className="flex -space-x-1.5 overflow-hidden shrink-0">
              {splitMembers.slice(0, 3).map(id => {
                const m = members.find(member => member.id === id);
                return (
                  <div key={id} className="w-7 h-7 rounded-full border-2 border-zinc-900 bg-zinc-800 overflow-hidden">
                    <img src={m?.avatar_url || `https://ui-avatars.com/api/?name=${m?.name || '?'}`} alt="" className="w-full h-full object-cover" />
                  </div>
                );
              })}
              {splitMembers.length > 3 && (
                <div className="w-7 h-7 rounded-full border-2 border-zinc-900 bg-zinc-800 flex items-center justify-center text-[8px] text-zinc-400 font-bold">+{splitMembers.length - 3}</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Split</div>
              <div className="text-xs font-bold text-white truncate">
                {splitMembers.length === members.length ? 'Everyone' : `${splitMembers.length} People`}
              </div>
            </div>
          </button>
        </div>

        {/* Calculator */}
        <div className="bg-zinc-900 border-t border-zinc-800 px-4 pt-3 pb-2 flex-1 flex flex-col justify-between">
          {/* Amount display */}
          <div className="flex items-end justify-between mb-3 px-1">
            <div className="relative">
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="appearance-none bg-transparent text-orange-500 font-bold text-xl pr-6 focus:outline-none cursor-pointer"
              >
                {currencies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none" size={16} />
            </div>
            <div className="text-4xl font-mono font-bold text-white tracking-tight">{amountStr}</div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-2 flex-1">
            {['1', '2', '3', 'C'].map(k => (
              <button key={k} onClick={() => k === 'C' ? handleClear() : handleDigit(k)}
                className={clsx("rounded-2xl font-bold text-2xl transition-all active:scale-95 active:brightness-75",
                  k === 'C' ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-zinc-800 text-white hover:bg-zinc-700"
                )}>
                {k}
              </button>
            ))}
            {['4', '5', '6', '⌫'].map(k => (
              <button key={k} onClick={() => k === '⌫' ? handleBackspace() : handleDigit(k)}
                className={clsx("rounded-2xl font-bold text-2xl transition-all active:scale-95 active:brightness-75",
                  k === '⌫' ? "bg-zinc-800 text-orange-500 hover:bg-zinc-700" : "bg-zinc-800 text-white hover:bg-zinc-700"
                )}>
                {k}
              </button>
            ))}
            {['7', '8', '9', '.'].map(k => (
              <button key={k} onClick={() => handleDigit(k)}
                className="rounded-2xl font-bold text-2xl bg-zinc-800 text-white hover:bg-zinc-700 transition-all active:scale-95 active:brightness-75">
                {k}
              </button>
            ))}
            <button onClick={() => handleDigit('0')}
              className="rounded-2xl font-bold text-2xl bg-zinc-800 text-white hover:bg-zinc-700 transition-all active:scale-95 active:brightness-75 col-span-2">
              0
            </button>
            <button onClick={handleSubmit} disabled={submitting || !itemName || parseFloat(amountStr) === 0}
              className="rounded-2xl font-bold text-2xl bg-orange-500 text-white hover:bg-orange-600 transition-all active:scale-95 col-span-2 shadow-lg shadow-orange-500/20 disabled:opacity-40 flex items-center justify-center">
              {submitting ? <Loader2 className="animate-spin" size={28} /> : <Check size={28} />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-2">Delete Expense?</h3>
              <p className="text-zinc-400 mb-6">Are you sure you want to delete <span className="text-white font-medium">{itemName}</span>? This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">Cancel</button>
                <button onClick={confirmDelete} className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">Delete</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Category Picker */}
        {isCategoryModalOpen && (
          <CategoryModal
            categories={categories}
            selected={category}
            onSelect={setCategory}
            onClose={() => setIsCategoryModalOpen(false)}
          />
        )}

        {/* Payer Selection */}
        {isPayerModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
              className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Who Paid?</h3>
                <button onClick={() => setIsPayerModalOpen(false)} className="p-2 text-zinc-500 hover:text-white"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {members.map(m => (
                  <button key={m.id} onClick={() => { setPayerId(m.id); setIsPayerModalOpen(false); }}
                    className={clsx("flex items-center gap-3 p-3 rounded-2xl border transition-all",
                      payerId === m.id ? "bg-orange-500 border-orange-500 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    )}>
                    <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                      <img src={m.avatar_url || `https://ui-avatars.com/api/?name=${m.name}`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm font-bold truncate">{m.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* Split Selection */}
        {isSplitModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
              className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Split With</h3>
                <div className="flex gap-2">
                  <button onClick={() => setSplitMembers(members.map(m => m.id))} className="text-xs text-orange-500 font-bold uppercase tracking-wider">All</button>
                  <button onClick={() => setIsSplitModalOpen(false)} className="p-2 text-zinc-500 hover:text-white"><X size={20} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto no-scrollbar">
                {members.map(m => (
                  <button key={m.id} onClick={() => toggleSplitMember(m.id)}
                    className={clsx("flex items-center gap-3 p-3 rounded-2xl border transition-all",
                      splitMembers.includes(m.id) ? "bg-orange-500 border-orange-500 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    )}>
                    <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                      <img src={m.avatar_url || `https://ui-avatars.com/api/?name=${m.name}`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm font-bold truncate">{m.name}</span>
                    {splitMembers.includes(m.id) && <Check size={16} className="ml-auto" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setIsSplitModalOpen(false)}
                className="w-full mt-6 bg-orange-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-orange-500/20">
                Done
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
