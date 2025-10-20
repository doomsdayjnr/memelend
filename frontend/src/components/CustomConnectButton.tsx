import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";

export function CustomConnectButton() {
  const { setVisible } = useWalletModal();
  const { connected, publicKey, disconnect } = useWallet();
  const { connection } = useConnection();
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [referralError, setReferralError] = useState("");

  // --- Capture and store ?ref=XYZ on first load ---
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const ref = queryParams.get("ref");
    if (ref) {
      localStorage.setItem("referralCode", ref.toUpperCase());
    }
  }, [location.search]);

  // --- Register user on wallet connect ---
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
          if (!storedRef) {
            setShowReferralModal(true);
          } else {
            localStorage.removeItem("referralCode");
            setShowReferralModal(false);
          }
        } else {
          setShowReferralModal(false);
        }
      }
    } catch (err) {
      console.error("User registration failed:", err);
    }
  };

  // --- Fetch SOL balance + register user when connected ---
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
    <>
      {/* --- Main Connect / Wallet Button --- */}
      {!connected ? (
        <button
          onClick={() => setVisible(true)}
          style={{
            background: "#ffcc00",
            color: "#000",
            padding: "10px 20px",
            borderRadius: "10px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Connect Wallet
        </button>
      ) : (
        <div className="user-dropdown-container">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="user-toggle-button"
            style={{
              background: "#222",
              color: "#fff",
              padding: "10px 20px",
              borderRadius: "10px",
              fontWeight: 600,
            }}
          >
            {username || "User"}
          </button>

          {menuOpen && (
            <div className="user-dropdown">
              <p className="balance-display">
                Balance:{" "}
                {solBalance !== null
                  ? `${solBalance.toFixed(3)} SOL`
                  : "Loading..."}
              </p>
              <button
                onClick={disconnect}
                className="disconnect-button"
                style={{
                  marginTop: "10px",
                  background: "#ff4d4f",
                  color: "#fff",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- Referral Code Modal --- */}
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
              <button
                onClick={submitReferralCode}
                disabled={referralCodeInput.trim() === ""}
              >
                Submit
              </button>
              <button onClick={skipReferral}>Skip</button>
            </div>
            {referralError && (
              <p style={{ color: "var(--error-red)", marginTop: "4px" }}>
                {referralError}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
