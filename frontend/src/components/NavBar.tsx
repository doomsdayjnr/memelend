import {navLinks} from "../constants/index";
import { NavLink } from "react-router-dom";

function NavBar() {
  return (
    <div className="menu-content">
        <div className="menu-content-list">
            {navLinks.map((item:any) => (
              <NavLink to={item.href} key={item.index} className={({ isActive }) =>
              isActive ? "main-menu active" : "main-menu"
              }>
                 {item.label}
              </NavLink>
            ))}
        </div>
    </div>
  )
}

export default NavBar;
