import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

export function CustomConnectButton() {
  const { setVisible } = useWalletModal();
  const { connected, publicKey, disconnect } = useWallet();

  return (
    <button
      onClick={() => (connected ? disconnect() : setVisible(true))} // <-- opens modal
      style={{
        background: connected ? "#222" : "#ffcc00",
        color: connected ? "#fff" : "#000",
        padding: "10px 20px",
        borderRadius: "10px",
        fontWeight: 600,
      }}
    >
      {connected ? `${publicKey?.toBase58().slice(0, 4)}...${publicKey?.toBase58().slice(-4)}` : "Connect Wallet"}
    </button>
  );
}
