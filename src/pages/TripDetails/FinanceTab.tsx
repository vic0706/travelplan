import React from 'react';
import { Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { Expense } from '../../types';

interface FinanceTabProps {
  filteredExpenses: Expense[];
  currency: string;
  canEdit: boolean;
  getUserNameById: (uid: number) => string;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
}

export function FinanceTab({
  filteredExpenses, currency, canEdit, getUserNameById, onAddExpense, onEditExpense,
}: FinanceTabProps) {
  const currencyTotals = filteredExpenses.reduce((acc, e) => {
    const cur = e.currency || currency;
    acc[cur] = (acc[cur] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
  const isMultiCurrency = Object.keys(currencyTotals).length > 1;
  const singleTotal = isMultiCurrency ? 0 : filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-lg font-bold text-white">每日支出</h3>
        <div className="text-right">
          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">當日合計</div>
          <div className="text-right">
            {isMultiCurrency ? (
              Object.entries(currencyTotals).map(([cur, amt]) => (
                <div key={cur} className="text-base font-bold text-white font-mono">{cur} {amt.toLocaleString()}</div>
              ))
            ) : (
              <div className="text-xl font-bold text-white font-mono">{currency} {singleTotal.toLocaleString()}</div>
            )}
          </div>
        </div>
      </div>

      {filteredExpenses.length > 0 ? (
        filteredExpenses.map(expense => (
          <div
            key={expense.id}
            onClick={() => { if (canEdit) onEditExpense(expense); }}
            className={clsx(
              'bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-lg flex items-center justify-between transition-colors',
              canEdit && 'cursor-pointer hover:bg-zinc-800/50'
            )}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-400 text-xl font-bold">
                $
              </div>
              <div>
                <h4 className="text-white font-medium">{expense.item_name}</h4>
                <p className="text-xs text-zinc-500 mt-1">由 {getUserNameById(expense.payer_id)} 付款</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-white">{expense.amount.toLocaleString()}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{expense.currency}</div>
            </div>
          </div>
        ))
      ) : (
        <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-3xl">
          <p>這天還沒有記帳</p>
        </div>
      )}

      {canEdit && (
        <button
          onClick={onAddExpense}
          className="w-full mt-6 py-4 border-2 border-dashed border-zinc-800 rounded-3xl flex items-center justify-center gap-2 text-zinc-500 hover:text-orange-500 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all"
        >
          <Plus size={20} /><span className="font-medium">＋ 新增記帳</span>
        </button>
      )}
    </div>
  );
}
