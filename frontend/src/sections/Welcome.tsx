import { Link } from "react-router-dom";
import "../styles/Welcome.css";
import "../styles/landing_page/landingPage.css";
import HeroSection from "../components/landing_page/HeroSection";
import AboutSection from "../components/landing_page/AboutSection";
import ReinforcedBondingCurve from "../components/landing_page/ReinforcedBondingCurve";
import FeatureSection from "../components/landing_page/FeatureSection";
import FeesSection from "../components/landing_page/FeesSection";
import FAQSection from "../components/landing_page/FAQSection";
import FooterSection from "../components/landing_page/FooterSection";


function Welcome() {
  return (
    <div className="landing-page">
      <section className="hero-section">
        <HeroSection/>
      </section>
      <section className="about-section-frame">
        <AboutSection/>
      </section>
      <section className="reinforcement-bonding-curve-frame">
        <ReinforcedBondingCurve/>
      </section>
      <section className="how-it-work-frame">
        <FeatureSection/>
      </section>
      <section className="fees-structure-frame">
        <FeesSection/>
      </section>
      <section className="faq-structure-frame">
        <FAQSection/>
      </section>
      <section className="footer-structure-frame">
        <FooterSection/>
      </section>
      
    </div>
  );
}

export default Welcome;
