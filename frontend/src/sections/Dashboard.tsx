import { useState } from 'react';
import BalanceCheck from "../components/dashboard_components/BalanceCheck";
import Positions from "../components/dashboard_components/Positions";
import TokenStats from "../components/dashboard_components/TokenStats";
import YieldUsersPosition from "../components/dashboard_components/YieldUsersPosition";
import '../styles/dashboard/Dashboard.css';
import StatsPnLGraph from '../components/dashboard_components/StatsPnLGraph';
import History from '../components/dashboard_components/History';
import RankCheck from '../components/dashboard_components/RankCheck';
import PresaleHoldings from '../components/dashboard_components/PresaleHoldings';


function Dashboard() {

  const [activeTab, setActiveTab] = useState<'launches' | 'positions' | 'staked'| 'history'| 'presale'>('launches');
 
  const renderTabContent = () => {
    switch (activeTab) {
      case 'launches':
        return <TokenStats/>;
      case 'positions':
        return <Positions/>;
      case 'staked':
        return <YieldUsersPosition/>;
      case 'history':
        return <History/>;
      case 'presale':
        return <PresaleHoldings/>;
      default:
        return null;
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-content-container">
        <div className="dashboard-stats-frame">
          <div className="stats-balance-frame">
            <BalanceCheck/>
          </div>
          <div className="stats-perfomance-frame">
            <RankCheck/>
          </div>
          <div className="stats-graph-frame">
            <StatsPnLGraph />
          </div>
        </div>
        <div className="dashboard-position-frame">
          <div className="dashboard-position-tab-container">
              <button
                className={activeTab === 'launches' ? 'active' : ''}
                onClick={() => setActiveTab('launches')}
              >
                My Launches
              </button>

              <button
                className={activeTab === 'positions' ? 'active' : ''}
                onClick={() => setActiveTab('positions')}
              >
                Active Positions
              </button>

              <button
                className={activeTab === 'staked' ? 'active' : ''}
                onClick={() => setActiveTab('staked')}
              >
                Staked Positions
              </button>

              <button
                className={activeTab === 'history' ? 'active' : ''}
                onClick={() => setActiveTab('history')}
              >
                History
              </button>
              <button
                className={activeTab === 'presale' ? 'active' : ''}
                onClick={() => setActiveTab('presale')}
              >
                Presale Holdings
              </button>

          </div>
          <div className="dashboard-position-container">
              {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;