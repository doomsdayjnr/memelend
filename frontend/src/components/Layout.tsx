import {  type ReactNode } from "react";
import NavBar from "./NavBar";
import "../styles/Layout.css";
import logo from '../assets/MemeLend_Logo.png';
import { ToastProvider } from "../components/alerts/ToastContainer";
import { CustomConnectButton } from "./CustomConnectButton";
import MobileNavBar from "./MobileNavBar";

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  
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
            <CustomConnectButton />
          </div>
          <div className="mobile-nav-bar">
            <MobileNavBar />
          </div>
        </div>
        <div className="main-layout">{children}</div>
      </div>
    </ToastProvider>
  );
}

export default Layout;
