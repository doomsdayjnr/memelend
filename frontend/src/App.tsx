import LaunchForm from './components/LaunchForm';
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import Layout from "./components/Layout";
import Welcome from "./sections/Welcome";
import "./styles/Welcome.css";
import "./styles/NavBar.css";
import TopTraders from "./sections/TopTraders";
import Rewards from "./sections/Rewards";
import Memecoin from "./sections/Memecoin";
import Dashboard from "./sections/Dashboard";
import Presale from './sections/Presale';

function App() {
  const { connected, connecting } = useWallet(); // connecting = true during init
  const [ready, setReady] = useState(false);

  // Small delay to ensure wallet reconnection is done
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 400);
    return () => clearTimeout(timer);
  }, []);

  // While reconnecting or initializing, just show a loader or nothing
  if (!ready || connecting) {
    return <div className="loading-screen">Connecting wallet...</div>;
  }

  return (
    <Router>
      <Layout>
        <Routes>
          {!connected ? (
            <>
              <Route path="/" element={<Welcome />} />
              <Route path="*" element={<Navigate to="/" />} />
            </>
          ) : (
            <>
              <Route path="/launch" element={<LaunchForm />} />
              <Route path="/leaderboard/*" element={<TopTraders />} />
              <Route path="/memecoins/*" element={<Memecoin />} />
              <Route path="/presale/*" element={<Presale />} />
              <Route path="/rewards" element={<Rewards />} />
              <Route path="/portfolio" element={<Dashboard />} />
              <Route path="*" element={<Navigate to="/portfolio" />} />
            </>
          )}
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
