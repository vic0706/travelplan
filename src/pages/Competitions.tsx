import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Calendar, MapPin, Link as LinkIcon, Users, FileText, Award, Plus, Search, Filter, ChevronRight, Clock } from 'lucide-react';
import { clsx } from 'clsx';

interface Competition {
  id: string;
  name: string;
  organizer: string;
  category: string;
  registrationDeadline: string;
  competitionDate: string;
  status: '準備中' | '已報名' | '初賽' | '決賽' | '已結束';
  location: string;
  teamName?: string;
  members?: string[];
  website?: string;
  award?: string;
}

const mockCompetitions: Competition[] = [
  {
    id: '1',
    name: '2024 全國大專校院資訊應用服務創新競賽',
    organizer: '數位發展部',
    category: '資訊創新',
    registrationDeadline: '2024-09-30',
    competitionDate: '2024-11-02',
    status: '準備中',
    location: '台北市',
    teamName: '創新先鋒',
    members: ['王小明', '李小華', '陳大文'],
    website: 'https://innoserve.tca.org.tw/',
  },
  {
    id: '2',
    name: '梅竹黑客松 Meichu Hackathon',
    organizer: '清華大學、交通大學',
    category: '黑客松',
    registrationDeadline: '2024-10-15',
    competitionDate: '2024-10-26',
    status: '已報名',
    location: '新竹市',
    teamName: 'Debug Masters',
    members: ['張三', '李四'],
    website: 'https://hackathon.meichu.tw/',
  },
  {
    id: '3',
    name: 'Google 解決方案挑戰賽',
    organizer: 'Google Developer Student Clubs',
    category: '軟體開發',
    registrationDeadline: '2024-02-22',
    competitionDate: '2024-04-15',
    status: '已結束',
    location: '線上',
    teamName: 'Tech for Good',
    members: ['王小明', '林小美'],
    award: '全球 Top 50',
    website: 'https://developers.google.com/community/gdsc-solution-challenge',
  }
];

const statusColors = {
  '準備中': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  '已報名': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  '初賽': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  '決賽': 'bg-red-500/20 text-red-400 border-red-500/30',
  '已結束': 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

export function Competitions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('全部');

  const filteredCompetitions = mockCompetitions.filter(comp => {
    const matchesSearch = comp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          comp.organizer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === '全部' || comp.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Trophy className="w-8 h-8 text-orange-500" />
            競賽紀錄與管理
          </h1>
          <p className="text-zinc-400 mt-2">追蹤您的所有參賽進度、重要時程與獲獎紀錄</p>
        </div>
        <button className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-orange-500/20">
          <Plus className="w-5 h-5" />
          新增競賽
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input 
            type="text" 
            placeholder="搜尋競賽名稱或主辦單位..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
          {['全部', '準備中', '已報名', '初賽', '決賽', '已結束'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={clsx(
                "px-4 py-2.5 rounded-xl font-medium whitespace-nowrap transition-colors border",
                filterStatus === status 
                  ? "bg-zinc-800 text-white border-zinc-700" 
                  : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200"
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Competitions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCompetitions.map((comp, index) => (
          <motion.div
            key={comp.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors group cursor-pointer flex flex-col"
          >
            <div className="flex justify-between items-start mb-4">
              <span className={clsx("px-3 py-1 rounded-full text-xs font-medium border", statusColors[comp.status])}>
                {comp.status}
              </span>
              <span className="text-xs font-medium text-zinc-500 bg-zinc-800/50 px-2.5 py-1 rounded-md">
                {comp.category}
              </span>
            </div>
            
            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-orange-400 transition-colors line-clamp-2">
              {comp.name}
            </h3>
            <p className="text-sm text-zinc-400 mb-6">{comp.organizer}</p>

            <div className="space-y-3 mb-6 flex-1">
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-zinc-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">報名截止</p>
                  <p>{comp.registrationDeadline}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-zinc-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">比賽日期</p>
                  <p>{comp.competitionDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm text-zinc-300">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-zinc-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500">地點</p>
                  <p>{comp.location}</p>
                </div>
              </div>
            </div>

            {comp.award && (
              <div className="mt-auto mb-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 flex items-center gap-3">
                <Award className="w-5 h-5 text-yellow-500" />
                <div>
                  <p className="text-xs text-yellow-500/70 font-medium">獲獎紀錄</p>
                  <p className="text-sm font-bold text-yellow-500">{comp.award}</p>
                </div>
              </div>
            )}

            <div className="mt-auto pt-4 border-t border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Users className="w-4 h-4" />
                <span>{comp.teamName || '個人參賽'}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-orange-500 transition-colors" />
            </div>
          </motion.div>
        ))}
      </div>

      {filteredCompetitions.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-xl font-medium text-zinc-300 mb-2">沒有找到相關競賽</h3>
          <p className="text-zinc-500">試試看其他搜尋關鍵字或篩選條件</p>
        </div>
      )}
    </div>
  );
}
