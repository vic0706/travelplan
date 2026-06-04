import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { apiFetch } from '../../utils/api';
import { format, parseISO } from 'date-fns';
import { Loader2, X, Delete, Check, ChevronDown, Calendar } from 'lucide-react';
import { DynamicIcon } from '../common/DynamicIcon'; // ✅ 修正：移除重複定義，改用共用元件
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

export function FinanceForm({ tripId, defaultDate, currencies = ['TWD'], onSuccess, onCancel, initialData }: FinanceFormProps) {
  // ✅ 修正：從 store 取 categories，不再自己 fetch
  const { user, categories } = useAppStore();
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [itemName, setItemName] = useState(initialData?.item_name || '');
  const [date, setDate] = useState(initialData?.date || defaultDate || new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState(initialData?.category || 'Food');
  const [payerId, setPayerId] = useState<number>(initialData?.payer_id || user?.id || 0);
  const [splitMembers, setSplitMembers] = useState<number[]>(initialData?.split_members || []);
  const [amountStr, setAmountStr] = useState(initialData?.amount?.toString() || '0');
  const [currency, setCurrency] = useState(initialData?.currency || currencies[0] || 'TWD');
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPayerModalOpen, setIsPayerModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  useEffect(() => {
    // ✅ 修正：只需要 fetch members，categories 已由 App.tsx 全局載入
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

  // ✅ 當 store 的 categories 載入後，自動設定預設分類
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

  const handleClear = () => {
    setAmountStr('0');
  };

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

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] pb-safe-bottom">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 z-10">
          <h3 className="text-lg font-semibold text-white">{initialData ? 'Edit Expense' : 'Add Expense'}</h3>
          <div className="flex gap-2">
            {initialData && (
              <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors">
                <Delete size={20} />
              </button>
            )}
            <button onClick={onCancel} className="p-2 text-zinc-400 hover:bg-zinc-800 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Date & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Date</label>
              <button
                onClick={() => setIsDatePickerOpen(true)}
                className="w-full flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white hover:border-orange-500 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-orange-500" />
                  <span className="text-sm font-medium">{format(parseISO(date), 'MMM d, yyyy')}</span>
                </div>
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Category</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.name)}
                    className={clsx(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all border",
                      category === c.name 
                        ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20 scale-110 z-10" 
                        : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    )}
                    title={c.name}
                  >
                    <DynamicIcon name={c.icon} size={20} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Description</label>
            <input
              type="text"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder="What was this for?"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
            />
          </div>

          {/* Paid By & Split With */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Paid By</label>
              <button
                onClick={() => setIsPayerModalOpen(true)}
                className="w-full flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-2xl p-2 text-left hover:border-orange-500 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700">
                  <img 
                    src={members.find(m => m.id === payerId)?.avatar_url || `https://ui-avatars.com/api/?name=${members.find(m => m.id === payerId)?.name || '?'}`} 
                    alt="Payer" 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {members.find(m => m.id === payerId)?.name || 'Select Payer'}
                  </div>
                </div>
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Split With</label>
              <button
                onClick={() => setIsSplitModalOpen(true)}
                className="w-full flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-2 text-left hover:border-orange-500 transition-colors"
              >
                <div className="flex -space-x-2 overflow-hidden shrink-0">
                  {splitMembers.slice(0, 3).map(id => {
                    const m = members.find(member => member.id === id);
                    return (
                      <div key={id} className="w-6 h-6 rounded-full border-2 border-zinc-950 bg-zinc-800 overflow-hidden">
                        <img src={m?.avatar_url || `https://ui-avatars.com/api/?name=${m?.name || '?'}`} alt="" className="w-full h-full object-cover" />
                      </div>
                    );
                  })}
                  {splitMembers.length > 3 && (
                    <div className="w-6 h-6 rounded-full border-2 border-zinc-950 bg-zinc-800 flex items-center justify-center text-[8px] text-zinc-400 font-bold">
                      +{splitMembers.length - 3}
                    </div>
                  )}
                </div>
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">
                  {splitMembers.length === members.length ? 'Everyone' : `${splitMembers.length} People`}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Calculator Section */}
        <div className="bg-zinc-950 border-t border-zinc-800 p-4">
          <div className="flex items-end justify-between mb-4 px-2">
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
            <div className="text-4xl font-mono font-bold text-white tracking-tight">
              {amountStr}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {['1', '2', '3', 'C'].map(k => (
              <button key={k} onClick={() => k === 'C' ? handleClear() : handleDigit(k)}
                className={clsx("h-14 rounded-2xl font-bold text-xl transition-all active:scale-95",
                  k === 'C' ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}>
                {k}
              </button>
            ))}
            {['4', '5', '6', '⌫'].map(k => (
              <button key={k} onClick={() => k === '⌫' ? handleBackspace() : handleDigit(k)}
                className={clsx("h-14 rounded-2xl font-bold text-xl transition-all active:scale-95",
                  k === '⌫' ? "bg-zinc-900 text-orange-500 hover:bg-zinc-800" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}>
                {k}
              </button>
            ))}
            {['7', '8', '9', '.'].map(k => (
              <button key={k} onClick={() => handleDigit(k)}
                className="h-14 rounded-2xl font-bold text-xl bg-zinc-900 text-white hover:bg-zinc-800 transition-all active:scale-95">
                {k}
              </button>
            ))}
            <button onClick={() => handleDigit('0')}
              className="h-14 rounded-2xl font-bold text-xl bg-zinc-900 text-white hover:bg-zinc-800 transition-all active:scale-95 col-span-2">
              0
            </button>
            <button onClick={handleSubmit} disabled={submitting || !itemName || parseFloat(amountStr) === 0}
              className="h-14 rounded-2xl font-bold text-xl bg-orange-500 text-white hover:bg-orange-600 transition-all active:scale-95 col-span-2 shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center">
              {submitting ? <Loader2 className="animate-spin" /> : <Check size={28} />}
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

        {/* Date Picker */}
        {isDatePickerOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Select Date</h3>
                <button onClick={() => setIsDatePickerOpen(false)} className="p-2 text-zinc-500 hover:text-white"><X size={20} /></button>
              </div>
              <input 
                type="date" value={date}
                onChange={(e) => { setDate(e.target.value); setIsDatePickerOpen(false); }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-lg focus:outline-none focus:border-orange-500"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}