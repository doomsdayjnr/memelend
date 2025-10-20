import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { type FC } from "react";

interface CustomConnectButtonProps {
  onConnect?: () => void; // Callback after wallet connects
}

export const CustomConnectButton: FC<CustomConnectButtonProps> = ({ onConnect }) => {
  const { setVisible } = useWalletModal();
  const { connected, publicKey, disconnect } = useWallet();

  const handleClick = () => {
    if (connected) {
      disconnect();
    } else {
      setVisible(true); // opens wallet modal
    }
  };

  // Call onConnect when the wallet connects
  // You can do this in Layout's useEffect as well, but this is optional
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
