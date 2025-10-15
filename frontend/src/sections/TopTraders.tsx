import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import '../styles/chart/Memecoin.css';
import TopReferralEarners from '../components/leaderboard/TopReferralEarners';
import TopCreatorEarners from '../components/leaderboard/TopCreatorEarners';
import TopRankedCreator from '../components/leaderboard/TopRankedCreator';
import TopRankedTrader from '../components/leaderboard/TopRankedTrader';

function TopTraders() {

  const navigate = useNavigate();
  const location = useLocation();

  const [selectedTab, setSelectedTab] = useState<'referral' | 'creator-earner' | 'creator-rank' | 'trader-rank' | null>(null);

  useEffect(() => {
    if (location.pathname.endsWith('/referral')) setSelectedTab('referral');
    else if (location.pathname.endsWith('/creator-earner')) setSelectedTab('creator-earner');
    else if (location.pathname.endsWith('/creator-rank')) setSelectedTab('creator-rank');
    else if (location.pathname.endsWith('/trader-rank')) setSelectedTab('trader-rank');
    else setSelectedTab(null); // when viewing a token or unknown path
  }, [location.pathname]);

  const handleTabClick = (tab: 'referral' | 'creator-earner' | 'creator-rank'| 'trader-rank') => {
    setSelectedTab(tab);
    navigate(`/leaderboard/${tab}`);
  };

  return (
    <div className="memecoin-container">
      <aside className="sidebar">
        
        {/* Default tabs */}
        <button
          className={`sidebar-btn ${selectedTab === 'trader-rank' ? 'active' : ''}`}
          onClick={() => handleTabClick('trader-rank')}
        >
         🏆 Trading Legends
        </button>

        <button
          className={`sidebar-btn ${selectedTab === 'creator-rank' ? 'active' : ''}`}
          onClick={() => handleTabClick('creator-rank')}
        >
         🔥 Hot Creators
        </button>

        <button
          className={`sidebar-btn ${selectedTab === 'referral' ? 'active' : ''}`}
          onClick={() => handleTabClick('referral')}
        >
         👥 Referral Champs
        </button>

        <button
          className={`sidebar-btn ${selectedTab === 'creator-earner' ? 'active' : ''}`}
          onClick={() => handleTabClick('creator-earner')}
        >
         💰 Biggest Bags
        </button>
        
      </aside>

      <main className="content">
        <Routes>
          {/* Default route → redirect to /new */}
          <Route path="/" element={<Navigate to="/leaderboard/trader-rank" replace />} />

          {/* Tabs */}
          <Route path="/referral" element={<TopReferralEarners />} />
          <Route path="/creator-earner" element={<TopCreatorEarners />} />
          <Route path="/creator-rank" element={<TopRankedCreator />} />
          <Route path="/trader-rank" element={<TopRankedTrader />} />
        </Routes>
      </main>
    </div>
  )
}

export default TopTraders
