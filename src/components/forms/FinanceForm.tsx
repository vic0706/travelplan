import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { apiFetch } from '../../utils/api';
import { format, parseISO } from 'date-fns';
import { Loader2, X, Delete, Check, ChevronDown, ChevronRight, Calendar, Clock } from 'lucide-react';
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

export function FinanceForm({ tripId, defaultDate, currencies = ['TWD'], onSuccess, onCancel, initialData }: FinanceFormProps) {
  const { user, categories } = useAppStore();
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [itemName, setItemName] = useState(initialData?.item_name || '');
  const [date, setDate] = useState(initialData?.date || defaultDate || new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(initialData?.time || format(new Date(), 'HH:mm'));
  const [category, setCategory] = useState(initialData?.category || 'Food');
  const [payerId, setPayerId] = useState<number>(initialData?.payer_id || user?.id || 0);
  const [splitMembers, setSplitMembers] = useState<number[]>(initialData?.split_members || []);
  const [amountStr, setAmountStr] = useState(initialData?.amount?.toString() || '0');
  const [currency, setCurrency] = useState(initialData?.currency || currencies[0] || 'TWD');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPayerModalOpen, setIsPayerModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/trips/${tripId}/members`);
        if (res.ok) {
          const data = await res.json() as User[];
          setMembers(data);
          if (!initialData) {
            setSplitMembers(data.map(m => m.id));
            if (!payerId && data.length > 0) setPayerId(data[0].id);
          }
        }
      } catch { console.error('Failed to fetch members'); }
      finally { setLoading(false); }
    };
    fetchMembers();
  }, [tripId]);

  useEffect(() => {
    if (!initialData && categories.length > 0) {
      setCategory(categories.find((c: any) => c.is_default)?.name || categories[0].name);
    }
  }, [categories, initialData]);

  const handleDigit = (d: string) => {
    if (d === '.' && amountStr.includes('.')) return;
    setAmountStr(prev => prev === '0' && d !== '.' ? d : prev + d);
  };
  const handleBackspace = () => setAmountStr(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
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
          time,
          category,
          payer_id: payerId,
          split_members: splitMembers,
          notes: ''
        })
      });
      if (!res.ok) throw new Error('Failed');
      onSuccess();
    } catch { alert('儲存失敗'); }
    finally { setSubmitting(false); }
  };

  const confirmDelete = async () => {
    if (!initialData) return;
    setSubmitting(true);
    setShowDeleteConfirm(false);
    try {
      const res = await apiFetch(`/api/trips/${tripId}/expenses/${initialData.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      onSuccess();
    } catch { alert('刪除失敗'); }
    finally { setSubmitting(false); }
  };

  const toggleSplitMember = (id: number) => {
    setSplitMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const selectedCat = categories.find((c: any) => c.name === category);

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-orange-500" /></div>;

  return (
    <>
      <div className="bg-[#1c1c1e] border border-zinc-800 rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* 標頭 */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 z-10">
          <h3 className="text-lg font-black text-white">{initialData ? '編輯記帳' : '新增記帳'}</h3>
          <div className="flex gap-2">
            {initialData && (
              <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors">
                <Delete size={20} />
              </button>
            )}
            <button onClick={onCancel} className="p-2 text-zinc-400 hover:bg-zinc-800 rounded-full transition-colors"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* 日期 + 時間 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">日期</label>
              <button onClick={() => setIsDatePickerOpen(true)}
                className="w-full flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-3 text-white hover:border-orange-500 transition-colors">
                <Calendar size={15} className="text-orange-500 shrink-0" />
                <span className="text-sm font-medium">{format(parseISO(date), 'MM/dd')}</span>
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">時間</label>
              <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-3 focus-within:border-orange-500 transition-colors">
                <Clock size={15} className="text-orange-500 shrink-0" />
                <input type="time" value={time} onChange={e => setTime(e.target.value)}
                  className="flex-1 bg-transparent text-white text-sm font-mono font-bold outline-none [color-scheme:dark]" />
              </div>
            </div>
          </div>

          {/* 類別選擇 */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">分類</label>
            <button onClick={() => setIsCategoryModalOpen(true)}
              className="w-full flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 hover:border-orange-500 transition-colors">
              <div className="flex items-center gap-3">
                {selectedCat && (
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${selectedCat.color}20`, color: selectedCat.color }}>
                    <DynamicIcon name={selectedCat.icon} size={20} />
                  </div>
                )}
                <span className="text-sm font-bold text-white">{category}</span>
              </div>
              <ChevronRight size={16} className="text-zinc-500" />
            </button>
          </div>

          {/* 項目名稱 */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">項目名稱</label>
            <input type="text" value={itemName} onChange={e => setItemName(e.target.value)}
              placeholder="費用名稱"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base focus:outline-none focus:border-orange-500 placeholder:text-zinc-600" />
          </div>

          {/* 付款人 + 分攤 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">付款人</label>
              <button onClick={() => setIsPayerModalOpen(true)}
                className="w-full flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-2.5 text-left hover:border-orange-500 transition-colors">
                <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700">
                  <img src={members.find(m => m.id === payerId)?.avatar_url || `https://ui-avatars.com/api/?name=${members.find(m => m.id === payerId)?.name || '?'}`} alt="付款人" className="w-full h-full object-cover" />
                </div>
                <span className="text-xs font-bold text-white truncate">{members.find(m => m.id === payerId)?.name || '選擇付款人'}</span>
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">共同分攤</label>
              <button onClick={() => setIsSplitModalOpen(true)}
                className="w-full flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-2.5 text-left hover:border-orange-500 transition-colors">
                <div className="flex -space-x-2 overflow-hidden shrink-0">
                  {splitMembers.slice(0, 3).map(id => {
                    const m = members.find(member => member.id === id);
                    return <div key={id} className="w-6 h-6 rounded-full border-2 border-zinc-950 bg-zinc-800 overflow-hidden"><img src={m?.avatar_url || `https://ui-avatars.com/api/?name=${m?.name || '?'}`} alt="" className="w-full h-full object-cover" /></div>;
                  })}
                  {splitMembers.length > 3 && <div className="w-6 h-6 rounded-full border-2 border-zinc-950 bg-zinc-800 flex items-center justify-center text-[8px] text-zinc-400 font-bold">+{splitMembers.length - 3}</div>}
                </div>
                <span className="text-[10px] font-bold text-zinc-400">{splitMembers.length === members.length ? '所有人' : `${splitMembers.length} 人`}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 計算機 */}
        <div className="bg-zinc-950 border-t border-zinc-800 p-4">
          <div className="flex items-end justify-between mb-4 px-2">
            <div className="relative">
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="appearance-none bg-transparent text-orange-500 font-bold text-xl pr-6 focus:outline-none cursor-pointer">
                {currencies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-orange-500 pointer-events-none" size={16} />
            </div>
            <div className="text-5xl font-mono font-bold text-white tracking-tight">{amountStr}</div>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            {['1','2','3','C'].map(k => (
              <button key={k} onClick={() => k === 'C' ? handleClear() : handleDigit(k)}
                className={clsx("h-16 rounded-2xl font-bold text-2xl transition-all active:scale-95",
                  k === 'C' ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}>{k}</button>
            ))}
            {['4','5','6','⌫'].map(k => (
              <button key={k} onClick={() => k === '⌫' ? handleBackspace() : handleDigit(k)}
                className={clsx("h-16 rounded-2xl font-bold text-2xl transition-all active:scale-95",
                  k === '⌫' ? "bg-zinc-900 text-orange-500 hover:bg-zinc-800" : "bg-zinc-900 text-white hover:bg-zinc-800"
                )}>{k}</button>
            ))}
            {['7','8','9','.'].map(k => (
              <button key={k} onClick={() => handleDigit(k)}
                className="h-16 rounded-2xl font-bold text-2xl bg-zinc-900 text-white hover:bg-zinc-800 transition-all active:scale-95">{k}</button>
            ))}
            <button onClick={() => handleDigit('0')}
              className="h-16 rounded-2xl font-bold text-2xl bg-zinc-900 text-white hover:bg-zinc-800 transition-all active:scale-95 col-span-2">0</button>
            <button onClick={handleSubmit} disabled={submitting || !itemName || parseFloat(amountStr) === 0}
              className="h-16 rounded-2xl font-bold text-2xl bg-orange-500 text-white hover:bg-orange-600 transition-all active:scale-95 col-span-2 shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center">
              {submitting ? <Loader2 className="animate-spin" size={24} /> : <Check size={32} />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {/* 刪除確認 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-2">刪除記帳？</h3>
              <p className="text-zinc-400 mb-6">確定要刪除這筆記帳嗎？此操作無法復原。</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-3 rounded-xl font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">取消</button>
                <button onClick={confirmDelete} className="flex-1 px-4 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">刪除</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* 類別選擇 */}
        {isCategoryModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
              className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">選擇分類</h3>
                <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 text-zinc-500 hover:text-white"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto no-scrollbar">
                {categories.map((c: any) => (
                  <button key={c.id} onClick={() => { setCategory(c.name); setIsCategoryModalOpen(false); }}
                    className={clsx("flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
                      category === c.name
                        ? "border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10"
                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                    )}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${c.color}20`, color: c.color }}>
                      <DynamicIcon name={c.icon} size={22} />
                    </div>
                    <span className={clsx("text-xs font-bold text-center leading-tight", category === c.name ? "text-orange-500" : "text-zinc-300")}>{c.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* 付款人選擇 */}
        {isPayerModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
              className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">誰付款？</h3>
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

        {/* 分攤選擇 */}
        {isSplitModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
              className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">共同分攤</h3>
                <div className="flex gap-2">
                  <button onClick={() => setSplitMembers(members.map(m => m.id))} className="text-xs text-orange-500 font-bold uppercase tracking-wider">全選</button>
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
                    {splitMembers.includes(m.id) && <Check size={16} className="ml-auto shrink-0" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setIsSplitModalOpen(false)}
                className="w-full mt-6 bg-orange-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-orange-500/20">確認</button>
            </motion.div>
          </div>
        )}

        {/* 日期選擇 */}
        {isDatePickerOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">選擇日期</h3>
                <button onClick={() => setIsDatePickerOpen(false)} className="p-2 text-zinc-500 hover:text-white"><X size={20} /></button>
              </div>
              <input type="date" value={date}
                onChange={e => { setDate(e.target.value); setIsDatePickerOpen(false); }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-lg focus:outline-none focus:border-orange-500 [color-scheme:dark]" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
