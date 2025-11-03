import heroImg from "../../assets/Shield Landing Page.png";
import { Link } from "react-router-dom";
import '../../styles/landing_page/heroSection.css';

function HeroSection() {
  return (
    <div className="hero-section-container">
        <div className="hero-section-my-element">
            <h1 className="hero-title">Trade Memecoins Beyond Hype. Go Long or Short From Day One.</h1>
            <h2 className="hero-subtitle">A DeFi platform where you can earn yield, trade safely, and profit whether meme tokens rise or fall.</h2>
            <div className="hero-action-btn-group">
            <Link to="/launch" className="call-for-action-btn">Launch Token</Link>
            <Link to="#" className="how-it-work-btn">How It Works</Link>
            </div>
        </div>
        <div className="my-shield">
        <img src={heroImg} className="shield-img" alt="A stylized 3D shield representing a secure liquidity pool with arrows indicating long and short positions."/>
        </div>
    </div>
  )
}

export default HeroSection