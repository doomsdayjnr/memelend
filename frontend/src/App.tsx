import LaunchForm from './components/LaunchForm'
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


function App() {
  const { connected } = useWallet();
  return (
    <Router>
      <Layout>
        <Routes>
          <Route
            path="/"
            element={
              connected ? <Navigate to="/portfolio" replace /> : <Welcome />
            }
          />
          <Route
            path="/launch"
            element={connected ? <LaunchForm /> : <Navigate to="/" replace />}
          />
          <Route
            path="/leaderboard/*"
            element={connected ? <TopTraders /> : <Navigate to="/" replace />}
          />
          <Route
            path="/memecoins/*"
            element={connected ? <Memecoin /> : <Navigate to="/" replace />}
          />
          <Route
            path="/presale/*"
            element={connected ? <Presale /> : <Navigate to="/" replace />}
          />
          <Route
            path="/rewards"
            element={connected ? <Rewards /> : <Navigate to="/" replace />}
          />
          <Route
            path="/portfolio"
            element={connected ? <Dashboard /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App
