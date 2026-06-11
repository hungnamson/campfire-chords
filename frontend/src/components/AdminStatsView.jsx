import React, { useState, useEffect } from 'react';
import { Sparkles, Users, Clock, Flame, BarChart3, RotateCw } from 'lucide-react';

export default function AdminStatsView({ API_BASE }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/analytics/stats`);
      if (!res.ok) throw new Error('Failed to fetch analytics statistics');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error(err);
      setError('Không thể tải dữ liệu thống kê từ máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-20 bg-white border border-[#EBDDCB] rounded-2xl shadow-sm max-w-6xl mx-auto animate-fade-in w-full">
        <div className="w-10 h-10 border-4 border-[#FF8A00]/20 border-t-[#FF8A00] rounded-full animate-spin mx-auto mb-4"></div>
        <h3 className="text-sm font-bold text-stone-600">Đang tải dữ liệu thống kê hệ thống...</h3>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="text-center py-16 bg-red-50/50 border border-red-200 rounded-2xl shadow-sm max-w-6xl mx-auto p-6 animate-fade-in w-full">
        <h3 className="text-sm font-bold text-stone-900">{error || 'Có lỗi xảy ra'}</h3>
        <button
          onClick={fetchStats}
          className="mt-4 px-4 py-2 bg-[#FF8A00] hover:bg-[#E07200] text-white font-bold text-xs rounded-lg transition shadow-md cursor-pointer"
        >
          Thử lại / Retry
        </button>
      </div>
    );
  }

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Compile total feature usage to calculate percentages
  const features = [
    { name: 'Dịch giọng (Transpose)', key: 'transpose', icon: '🔄' },
    { name: 'Bộ lên dây (Tuner)', key: 'tuner', icon: '🎸' },
    { name: 'Chia sẻ (Share)', key: 'share', icon: '🔗' },
    { name: 'In nhạc (Print)', key: 'print', icon: '🖨️' },
    { name: 'Tìm trực tuyến (Search Online)', key: 'search_online', icon: '🌐' },
    { name: 'Lưu yêu thích (Favorite Toggle)', key: 'favorite_toggle', icon: '❤️' }
  ];

  const totalFeaturesCount = Object.values(stats.featureUsage).reduce((a, b) => a + b, 0);

  return (
    <div className="animate-fade-in flex flex-col gap-6 max-w-6xl mx-auto w-full">
      <div className="border-b border-stone-200 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-stone-900 font-display flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#FF8A00]" />
            Thống kê hệ thống / Analytics Dashboard
          </h2>
          <p className="text-xs text-stone-500">Xem tổng quan lượng truy cập, sử dụng tính năng và lịch sử hoạt động.</p>
        </div>
        <button 
          onClick={fetchStats}
          className="p-2 bg-stone-100 hover:bg-stone-200 active:scale-95 transition rounded-lg border border-stone-200 text-stone-600 hover:text-stone-950 flex items-center gap-1 text-xs font-bold cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" /> Làm mới / Refresh
        </button>
      </div>

      {/* Stats Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Visits */}
        <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-[#FF8A00] text-xl shrink-0">
            👁️
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-stone-400">Lượt truy cập / Visits</p>
            <h4 className="text-2xl font-black text-stone-900 font-display mt-0.5">{stats.totalVisits}</h4>
            <p className="text-[10px] text-stone-400 mt-1">Từ các phiên đăng nhập & khách</p>
          </div>
        </div>

        {/* Card 2: Users */}
        <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 text-xl shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-stone-400">Thành viên / Users</p>
            <h4 className="text-2xl font-black text-stone-900 font-display mt-0.5">{stats.usersCount}</h4>
            <p className="text-[10px] text-stone-400 mt-1">Tài khoản đã đăng ký</p>
          </div>
        </div>

        {/* Card 3: Stay Duration */}
        <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 text-xl shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-stone-400">Thời gian ở lại / Stay</p>
            <h4 className="text-lg font-black text-stone-900 font-display mt-1">{formatDuration(stats.avgSessionDurationSeconds)}</h4>
            <p className="text-[10px] text-stone-400 mt-1.5">Trung bình trên một phiên</p>
          </div>
        </div>

        {/* Card 4: Sessions Tracked */}
        <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 text-xl shrink-0">
            🔥
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-stone-400">Tổng phiên / Sessions</p>
            <h4 className="text-2xl font-black text-stone-900 font-display mt-0.5">{stats.sessionCount}</h4>
            <p className="text-[10px] text-stone-400 mt-1">Phiên hoạt động được đo</p>
          </div>
        </div>
      </div>

      {/* Main Grid Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left / Feature Usage Breakdown & Users list (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6 w-full">
          {/* Feature usage progress bars */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs w-full">
            <h3 className="text-xs uppercase font-black tracking-widest text-[#4B2E20] mb-4 flex items-center gap-1.5 font-display border-b border-stone-100 pb-2">
              <Sparkles className="w-4 h-4 text-[#FF8A00]" />
              Tính năng dùng nhiều nhất / Most Used Functions
            </h3>
            <div className="flex flex-col gap-4">
              {features.map(feat => {
                const count = stats.featureUsage[feat.key] || 0;
                const pct = totalFeaturesCount > 0 ? Math.round((count / totalFeaturesCount) * 100) : 0;
                return (
                  <div key={feat.key} className="flex flex-col">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-700 mb-1">
                      <span>{feat.icon} {feat.name}</span>
                      <span>{count} lần ({pct}%)</span>
                    </div>
                    <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden border border-stone-200/50">
                      <div 
                        className="bg-[#FF8A00] h-full rounded-full transition-all duration-500" 
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* User registrations list */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs w-full">
            <h3 className="text-xs uppercase font-black tracking-widest text-[#4B2E20] mb-4 flex items-center gap-1.5 font-display border-b border-stone-100 pb-2">
              👤 Thành viên mới / Registered Users ({stats.usersCount})
            </h3>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 font-bold text-stone-500">
                    <th className="pb-2">Tên User / ID</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">Vai trò / Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {stats.users.map((u, i) => (
                    <tr key={i} className="text-stone-700 hover:bg-stone-50/50">
                      <td className="py-2.5 font-bold">{u.id}</td>
                      <td className="py-2.5">{u.email}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          u.role === 'admin' 
                            ? 'bg-orange-100 text-[#FF8A00] border border-orange-200' 
                            : 'bg-stone-100 text-stone-600'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right / Top played songs list (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-stone-200/80 rounded-2xl p-5 shadow-xs w-full">
          <h3 className="text-xs uppercase font-black tracking-widest text-[#4B2E20] mb-4 flex items-center gap-1.5 font-display border-b border-stone-100 pb-2">
            <Flame className="w-4 h-4 text-[#FF8A00] fill-[#FF8A00]/25" />
            Top 15 Bài hát được chơi / Most Played
          </h3>
          {stats.topPlayedSongs.length === 0 ? (
            <p className="text-stone-500 text-xs italic py-4">Chưa có bài hát nào được ghi nhận lượt chơi.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {stats.topPlayedSongs.map((song, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-stone-50/80 hover:bg-stone-50 border border-stone-100 rounded-xl transition-all shadow-xs group">
                  <div className="flex items-center gap-2.5 truncate min-w-0">
                    <span className="font-mono text-xs font-black text-stone-400 w-5">{idx + 1}.</span>
                    <div className="truncate min-w-0">
                      <h4 className="font-bold text-xs text-stone-900 group-hover:text-[#FF8A00] transition-colors truncate">{song.title}</h4>
                      <p className="text-[10px] text-stone-500 truncate">{song.artist}</p>
                    </div>
                  </div>
                  <span className="font-sans text-[10px] font-black text-[#FF8A00] bg-orange-100/55 border border-orange-200/60 px-2 py-0.5 rounded-full shrink-0">
                    {song.playCount} lượt chơi
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
