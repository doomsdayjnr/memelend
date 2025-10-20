import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { type FC } from "react";

interface CustomConnectButtonProps {
  onConnect?: () => void; // Optional callback after wallet connects
}

export const CustomConnectButton: FC<CustomConnectButtonProps> = ({ onConnect }) => {
  const { setVisible } = useWalletModal();
  const { connected, publicKey } = useWallet();

  const handleClick = () => {
    if (!connected) {
      setVisible(true); // only open wallet modal if not connected
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        background: connected ? "#222" : "#ffcc00",
        color: connected ? "#fff" : "#000",
        padding: "10px 20px",
        borderRadius: "10px",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {connected ? `${publicKey?.toBase58().slice(0, 4)}...${publicKey?.toBase58().slice(-4)}` : "Connect Wallet"}
    </button>
  );
};
