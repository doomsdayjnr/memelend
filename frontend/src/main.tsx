import React from "react";
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import {WalletAdapterNetwork} from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";


const network = WalletAdapterNetwork.Devnet;
const endpoint = "https://api.devnet.solana.com";

const wallets = [new PhantomWalletAdapter()];


createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
)
