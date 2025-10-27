import "../../styles/landing_page/footerSections.css";
import { siDiscord } from "simple-icons";
import { siTelegram } from "simple-icons";
import { siX } from "simple-icons";

function FooterSection() {
  return (
    <>
    <section className="footer-section">
      <div className="footer-container">
        <div className="footer-wrapper">
          <div className="footer-blur-1"></div>
          <div className="footer-blur-2"></div>

          <div className="footer-content">
            <h2>Join Our Community</h2>
            <p>
              Connect with fellow traders, get the latest updates, and be part of
              the MemeLend revolution.
            </p>

            <div className="footer-buttons">
                <a href="https://x.com/meme_lend" className="twitter-btn" title="Twitter/X">
                    <svg width="24" height="24" role="img" viewBox="0 0 24 24" fill="currentColor">
                        <path d={siX.path} />
                    </svg>
                </a>

                <a href="https://t.me/MemeLendOfficial" className="telegram-btn" title="Telegram">
                    <svg width="24" height="24" role="img" viewBox="0 0 24 24" fill="currentColor">
                        <path d={siTelegram.path} />
                    </svg>
                </a>
                <a href="https://discord.gg/re2rhGnrRu" className="discord-btn" title="Discord">
                    <svg
                    width="24"
                    height="24"
                    role="img"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    >
                        <path d={siDiscord.path} />
                    </svg>
                </a>
            </div>
          </div>
        </div>
      </div>
    </section>
    <div className="footer-section-bottom">
        <div className="footer-section-bottom-content">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
            <a href="#">Docs</a>
        </div>
      </div>
    </>
  );
}

export default FooterSection;
