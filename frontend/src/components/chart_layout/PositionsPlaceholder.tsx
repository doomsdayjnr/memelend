import { useState } from "react";
import Positions from "./Positions";
import '../../styles/chart/PositionsPlaceholder.css';
import Holders from "./Holders";
import DevInfo from "./DevInfo";


function PositionsPlaceholder({ mint }: any) {
  const tabData = [
    { id: 1, label: "Positions", content: <Positions /> },
    { id: 2, label: "Holders", content: <Holders mint={mint}/> },
    { id: 3, label: "Dev Info", content: <DevInfo mint={mint}/> },
  ];

  const [activeTab, setActiveTab] = useState<number>(tabData[0].id);

  return (
    <div className="placeholder-frame">
      {/* Toggle buttons */}
      <div className="placeholder-button-frame">
        {tabData.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? "active" : ""}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="placeholder-content">
        {tabData.find((tab) => tab.id === activeTab)?.content}
      </div>
    </div>
  );
}

export default PositionsPlaceholder;
