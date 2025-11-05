import LaunchForm from './components/LaunchForm';
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import Layout from "./components/Layout";
import Welcome from "./sections/Welcome";
import "./styles/Welcome.css";
import "./styles/NavBar.css";
import TopTraders from "./sections/TopTraders";
import Rewards from "./sections/Rewards";
import Memecoin from "./sections/Memecoin";
import Dashboard from "./sections/Dashboard";
import Presale from './sections/Presale';
import ShareModal from './components/social_media/ShareModal';

function App() {
  const { connected } = useWallet();

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/launch" element={<LaunchForm />} />
          <Route path="/leaderboard/*" element={<TopTraders />} />
          <Route path="/memecoins/*" element={<Memecoin />} />
          <Route path="/presale/*" element={<Presale />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/portfolio" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
