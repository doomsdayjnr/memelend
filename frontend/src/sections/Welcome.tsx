import '../styles/Welcome.css';
import '../styles/landing_page/landingPage.css';
import heroImg from '../assets/landing page hero image.png';

function Welcome() {
  return (
    <div className="landing-page">
      <section className="hero-section">
        <img src={heroImg} alt="MemeLend Hero" className="hero-img" />
        <div className="hero-section-title-frame">
          <h1 className="hero-title">
            Trade Memecoins Without the Rug. Go Long. Go Short. From Day One.
          </h1>
          <h3 className="hero-subtitle">
            MemeLend is the first platform that lets you short memecoins from
            creation, with built-in anti-rug pull protection. Finally, a fair fight.
          </h3>
        </div>
      </section>
      <section className='landing-page-features'>

      </section>
    </div>
  );
}

export default Welcome;
