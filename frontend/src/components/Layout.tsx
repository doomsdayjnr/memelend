import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState, type ReactNode } from "react";
import { WalletMultiButton, WalletDisconnectButton } from "@solana/wallet-adapter-react-ui";
import { useNavigate, useLocation } from "react-router-dom";
import NavBar from "./NavBar";
import axios from "axios";
import "../styles/Layout.css";
import logo from '../assets/MemeLend_Logo.png';
import { ToastProvider } from "../components/alerts/ToastContainer";

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [referralError, setReferralError] = useState("");

  // Capture and store ?ref=XYZ on first load
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const ref = queryParams.get("ref");
    if (ref) {
      localStorage.setItem("referralCode", ref.toUpperCase());
    }
  }, [location.search]);

  const registerUser = async () => {
    if (!publicKey) return;

    try {
      const storedRef = localStorage.getItem("referralCode");

      const res = await axios.post(`${apiBase}/users/register`, {
        wallet: publicKey.toBase58(),
        referredBy: storedRef || undefined,
      });


      if (res.data && res.data.user?.username) {
        setUsername(res.data.user.username);

        if (res.data.newUser) {
          // If no referral code stored yet, prompt user to enter one
          if (!storedRef) {
            setShowReferralModal(true);  // Show modal to enter referral code
          } else {
            // Referral code exists, proceed and clear it
            localStorage.removeItem("referralCode");
            setShowReferralModal(false);
          }
        } else {
          // Existing user, just hide modal
          setShowReferralModal(false);
        }
      }
    } catch (err) {
      console.error("User registration failed:", err);
    }
  };

  useEffect(() => {
    if (connected && publicKey) {
      registerUser();

      const fetchBalance = async () => {
        try {
          const lamports = await connection.getBalance(publicKey);
          setSolBalance(lamports / 1_000_000_000);
        } catch (err) {
          console.error("Failed to fetch balance:", err);
        }
      };

      fetchBalance();
    }
  }, [connected, publicKey, connection]);


  const submitReferralCode = () => {
    if (referralCodeInput.trim() === "") {
      setReferralError("Please enter a referral code or click Skip.");
      return;
    }
    localStorage.setItem("referralCode", referralCodeInput.trim().toUpperCase());
    registerUser();
    setReferralError("");
    setReferralCodeInput("");
    setShowReferralModal(false);
  };

  const skipReferral = () => {
    setReferralError("");
    setReferralCodeInput("");
    setShowReferralModal(false);
  };

  return (
    <ToastProvider>
      <div>
        <div className="welcome-header">
          <div className="logo">
            <div className="logo-content">
              <img src={logo} alt="MemeLend Logo" />
            </div>
          </div>

          <div className="nav-content"><NavBar /></div>

          <div className="login">
            {!connected ? (
              <WalletMultiButton className="connect-button" />
            ) : (
              <div className="user-dropdown-container">
                <button onClick={() => setMenuOpen(!menuOpen)} className="user-toggle-button">
                  {username || "User"}
                </button>
                {menuOpen && (
                  <div className="user-dropdown">
                    <p className="balance-display">
                      Balance: {solBalance !== null ? `${solBalance.toFixed(3)} SOL` : "Loading..."}
                    </p>
                    <WalletDisconnectButton className="disconnect-button" />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="main-layout">{children}</div>
        </div>

        {/* Referral Code Modal */}
        {showReferralModal && (
          <div className="referral-modal-overlay">
            <div className="referral-modal">
              <h3>Referral Code (Optional)</h3>
              <input
                type="text"
                placeholder="Enter code"
                value={referralCodeInput}
                onChange={(e) => {
                  setReferralCodeInput(e.target.value);
                  if (referralError) setReferralError("");
                }}
              />
              <div className="referral-buttons">
                <button onClick={submitReferralCode} disabled={referralCodeInput.trim() === ""}>
                  Submit
                </button>
                <button onClick={skipReferral}>Skip</button>
              </div>
              {referralError && (
                <p style={{ color: "var(--error-red)", marginTop: "4px" }}>{referralError}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </ToastProvider>
  );
}

export default Layout;
