import { useState } from "react";
import { navLinks } from "../constants/index";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react"; // nice minimal icons
import '../styles/MobileNavBar.css';
import { CustomConnectButton } from "./CustomConnectButton";

function MobileNavBar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Toggle Button */}
      <button
        className="mobile-menu-toggle"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle navigation"
      >
        {menuOpen ? <X size={26} /> : <Menu size={26} />}
      </button>

      {/* Menu Overlay */}
      <div className={`mobile-menu-overlay ${menuOpen ? "open" : ""}`}>
        <div className="mobile-menu-content">
          <div className="mobile-menu-content-list">
            {navLinks.map((item: any) => (
              <NavLink
                to={item.href}
                key={item.index}
                className={({ isActive }) =>
                  isActive ? "mobile-main-menu active" : "mobile-main-menu"
                }
                onClick={() => setMenuOpen(false)} // close on click
              >
                {item.label}
              </NavLink>
            ))}
            <CustomConnectButton/>
          </div>
        </div>
      </div>
    </>
  );
}

export default MobileNavBar;
