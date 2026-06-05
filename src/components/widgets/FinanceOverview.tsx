import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Expense, User } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wallet, ArrowRight, Copy, Check } from 'lucide-react';
import { useAppStore } from '../../store'; // ✅ 修正：從 store 取 categories，移除 apiFetch

interface FinanceOverviewProps {
  expenses: Expense[];
  members: User[];
  currency: string;
}

export function FinanceOverview({ expenses, members, currency }: FinanceOverviewProps) {
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // ✅ 修正：直接從 store 取，App.tsx 已全局初始化，不需要再 fetch
  const { categories } = useAppStore();

  const totalAmount = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + exp.amount, 0);
  }, [expenses]);

  const categoryData = useMemo(() => {
    const data: Record<string, number> = {};
    expenses.forEach(exp => {
      const cat = exp.category || 'Other';
      data[cat] = (data[cat] || 0) + exp.amount;
    });
    
    return Object.entries(data).map(([name, value]) => {
      const catDef = categories.find((c: any) => c.name === name);
      return {
        name,
        value,
        color: catDef?.color || '#808080'
      };
    }).sort((a, b) => b.value - a.value);
  }, [expenses, categories]);

  const debts = useMemo(() => {
    const balances: Record<number, number> = {};
    members.forEach(m => balances[m.id] = 0);

    expenses.forEach(exp => {
      const paidBy = exp.payer_id;
      const splitAmong = exp.split_members;
      if (splitAmong.length === 0) return;

      const amountPerPerson = exp.amount / splitAmong.length;
      balances[paidBy] = (balances[paidBy] || 0) + exp.amount;
      splitAmong.forEach(memberId => {
        balances[memberId] = (balances[memberId] || 0) - amountPerPerson;
      });
    });

    const debtors: { id: number, amount: number }[] = [];
    const creditors: { id: number, amount: number }[] = [];

    Object.entries(balances).forEach(([id, amount]) => {
      if (amount < -0.01) debtors.push({ id: Number(id), amount });
      if (amount > 0.01) creditors.push({ id: Number(id), amount });
    });

    debtors.sort((a, b) => a.amount - b.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const transfers: { from: number, to: number, amount: number }[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(Math.abs(debtor.amount), creditor.amount);
      
      transfers.push({ from: debtor.id, to: creditor.id, amount });
      debtor.amount += amount;
      creditor.amount -= amount;

      if (Math.abs(debtor.amount) < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    return transfers;
  }, [expenses, members]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const getPaymentInfo = (userId: number) => {
    const user = members.find(m => m.id === userId);
    if (!user?.payment_info) return null;
    try {
      return typeof user.payment_info === 'string' ? JSON.parse(user.payment_info) : user.payment_info;
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">費用總計</p>
          <p className="text-2xl font-bold text-white font-mono">{currency} {totalAmount.toLocaleString()}</p>
        </div>
        <button
          onClick={() => setShowSplitModal(true)}
          className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white p-4 rounded-2xl flex flex-col justify-between transition-all shadow-lg active:scale-95"
        >
          <Wallet className="mb-2 text-orange-500" />
          <div className="text-left">
            <p className="text-xs font-bold uppercase tracking-wider opacity-80 text-zinc-500">結算</p>
            <p className="font-bold">查看分攤結果</p>
          </div>
        </button>
      </div>

      {/* Chart */}
      {categoryData.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value: number) => `${currency} ${value.toLocaleString()}`}
              />
              <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Split Modal */}
      <AnimatePresence>
        {showSplitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSplitModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900 z-10">
                <h2 className="text-xl font-bold text-white">分攤結算</h2>
                <button onClick={() => setShowSplitModal(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                {debts.length === 0 ? (
                  <div className="text-center text-zinc-500 py-8">
                    <Check size={48} className="mx-auto mb-4 text-green-500" />
                    <p>帳款已結清！大家不需要互相支付。</p>
                  </div>
                ) : (
                  debts.map((transfer, idx) => {
                    const fromUser = members.find(m => m.id === transfer.from);
                    const toUser = members.find(m => m.id === transfer.to);
                    const paymentInfo = getPaymentInfo(transfer.to);

                    return (
                      <div key={idx} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden">
                              <img src={fromUser?.avatar_url} className="w-full h-full object-cover" />
                            </div>
                            <span className="font-bold text-white">{fromUser?.name}</span>
                          </div>
                          <div className="flex flex-col items-center px-2">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">付款給</span>
                            <ArrowRight size={16} className="text-zinc-600" />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden">
                              <img src={toUser?.avatar_url} className="w-full h-full object-cover" />
                            </div>
                            <span className="font-bold text-white">{toUser?.name}</span>
                          </div>
                        </div>

                        <div className="text-center py-2 bg-zinc-900 rounded-xl border border-zinc-800">
                          <span className="text-2xl font-mono font-bold text-orange-500">
                            {currency} {transfer.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </div>

                        {paymentInfo && (
                          <div className="space-y-2 text-sm bg-zinc-900/50 p-3 rounded-xl">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
                              {toUser?.name} 的收款資訊
                            </p>
                            {paymentInfo.cash && (
                              <div className="flex items-center gap-2 text-zinc-300">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                接受現金
                              </div>
                            )}
                            {paymentInfo.linepay && (
                              <div className="flex items-center justify-between bg-zinc-800 p-2 rounded-lg">
                                <div className="truncate flex-1 mr-2">
                                  <span className="text-zinc-500 text-xs block">LINE Pay</span>
                                  <span className="text-white">{paymentInfo.linepay}</span>
                                </div>
                                <button onClick={() => handleCopy(paymentInfo.linepay)} className="p-1.5 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white">
                                  {copiedText === paymentInfo.linepay ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                </button>
                              </div>
                            )}
                            {paymentInfo.bank_accounts?.map((bank: any, i: number) => (
                              <div key={i} className="flex items-center justify-between bg-zinc-800 p-2 rounded-lg">
                                <div className="truncate flex-1 mr-2">
                                  <span className="text-zinc-500 text-xs block">銀行 {bank.bank_code}</span>
                                  <span className="text-white font-mono">{bank.account}</span>
                                </div>
                                <button onClick={() => handleCopy(bank.account)} className="p-1.5 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white">
                                  {copiedText === bank.account ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}