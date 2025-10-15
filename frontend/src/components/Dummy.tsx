import secondImage from '../assets/MemeLend-Landing-Page2.png';
import firstImage from '../assets/MemeLend-Landing-Page1.png';
import oldWays from '../assets/old and new ways.png';
import { ArrowUp, ArrowDown } from "lucide-react";
import '../styles/Welcome.css';

function Welcome() {
  return (
    <div className="welcome">
      <h1 className="hero-title">
        Trade Memecoins Without the Rug. Go Long. Go Short. From Day One.
      </h1>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <img src={firstImage} alt="MemeLend Hero" className="hero-img" />
          <div className="hero-text">
            <h2>Stop Gambling. Start Trading.</h2>
            <p>
              MemeLend is the first platform that lets you short memecoins from
              creation, with built-in anti-rug pull protection. Finally, a fair fight.
            </p>
            <ul>
              <li>🔒 No KYC Ever: Trade anonymously. We believe in permissionless finance, not paperwork.</li>
              <li>💳 Your Keys, Your Crypto: Connect your wallet to trade. Never deposit your funds to a central wallet. Disconnect when you're done.</li>
              <li>⬆️⬇️ Long & Short: Profit from any market move.</li>
              <li>🛡️ Rug-Proof Vaults: Liquidity is locked by smart contract code.</li>
            </ul>
            <div className="cta-group">
              <button className="btn btn-primary">Launch Your Token</button>
              <button className="btn btn-secondary">How It Works</button>
            </div>
          </div>
        </div>
      </section>

      {/* Exit Liquidity */}
      <section className="feature">
        <h2>Tired of Being Exit Liquidity?</h2>
        <img src={secondImage} alt="Exit Liquidity" className="feature-img" />
        <p>
          On every other platform, you can only bet on success. MemeLend lets you bet on failure,
          and forces creators to play fair.
        </p>
      </section>

      {/* Safe & Permissionless */}
      <section className="feature">
        <h2>Built on True DeFi Principles.</h2>
        {/* Visual: A simple, clean graphic showing a wallet icon (like Phantom) 
        connecting via a plug to a smart contract icon, with a "No KYC" badge prominently displayed. */}
        <h2>Truly Non-Custodial</h2>
        <h3>You Never Give Up Control</h3>
        <p>
          Simply connect your wallet to interact with our smart contracts. Your funds never leave your wallet unless you approve a transaction. 
          There is no 'deposit' step. This eliminates the risk of exchange hacks and exit scams. When you're done, just disconnect.
        </p>
        <h2>No KYC</h2>
        <h3>Anonymous and Permissionless</h3>
        <p>
          We don't require your ID. We require your wallet. 
          Trade from anywhere in the world without handing over your personal data. 
          MemeLend is open to everyone, exactly as crypto was meant to be.
        </p>
      </section>

      {/* FAQ Section */}
      <section className="feature">
        <h2>FAQ</h2>
        <h3>Q: Do I need to do KYC to use MemeLend?</h3>
        <p>
          A: No. MemeLend is 100% permissionless and requires no Know-Your-Customer checks. Connect your wallet and start trading.
        </p>
        <h3>Q: How do I deposit funds into MemeLend?</h3>
        <p>
          A: You don't. MemeLend is non-custodial. 
          This means you never transfer your funds to us. 
          You simply connect your wallet (like Phantom or Solflare) and sign transactions to trade directly against our smart contracts. 
          Your assets always remain in your custody.
        </p>
      </section>

      {/* Features Grid */}
      <section className="features-grid">
        <h2>How We Prevent Rug Pulls & Create a Fair Market</h2>
        <div className="feature-card">
          <h3>🔒 Locked Liquidity</h3>
          <p>
            The moment a token is created, its liquidity is locked in our smart contract.
            Creators can't access it. Ever. Your investment is safe.
          </p>
        </div>
        <div className="feature-card">
          <h3>📈 Vested Creator Rewards</h3>
          <p>
            Creators can't dump on you. Their earnings are vested over 6 months.
            They win only if the project has long-term value.
          </p>
        </div>
        <div className="feature-card">
          <h3 className="flex items-center gap-2">
            <ArrowUp className="w-5 h-5 text-green-500" />
            <ArrowDown className="w-5 h-5 text-red-500" />
            Short at Launch
          </h3>
          <p>
            Think a token is overhyped? For the first time ever, you can short it from
            the second it launches.
          </p>
        </div>
        <div className="feature-card">
          <h3>🛡️ Anti-Whale Protection</h3>
          <p>
            Our smart contracts limit any single trade to 20% of the pool.
            This prevents pump-and-dump schemes.
          </p>
        </div>
      </section>

      {/* Self-Reinforcing Liquidity Engine. */}
      <section className="features-grid">
        <h2>The Self-Healing Liquidity Pool</h2>
        <h3>Liquidity That Grows Stronger With Every Trade.</h3>
        <div className="feature-card">
          <h4>Our reinforced bonding curve doesn't just set the price—it uses market 
            activity to protect your investment and create a healthier market for everyone.</h4>
           {/* The Visual: This is critical. You need an animated or interactive diagram. A simple version could be a circle with four quadrants:*/}
          <ul>
            <li>Short Position Opens: Icon of a short contract.</li>
            <li>Price Goes Up (Short Loses): Red arrow down for the shorter. A "+" symbol next to an accumulated_c vault.</li>
            <li>Price Goes Down (Short Wins): Green arrow up for the shorter. A "-" symbol next to a sol_reserve vault.</li>
            <li>The Result: An arrow pointing to a growing sol_reserve + accumulated_c pool, with a shield icon. Text: "Stronger Backing for Every Token."</li>
          </ul>
          <div>
            Traditional bonding curves can be drained. Ours is reinforced. Here’s how it works:

            When a short position is liquidated (fails), the leftover collateral isn't lost. 
            It's added to a special buffer vault (accumulated_c), effectively increasing the SOL value backing every token in the pool.

            When a short position is profitable (wins), profits are paid from the pool's main reserves (sol_reserve).

            This creates a powerful flywheel effect:
            More failing shorts → Larger safety buffer → Higher price floor for holders → A more resilient and attractive token.
          </div>
          <ul>
            <li>🛡️ A Rising Price Floor: The accumulated_c buffer acts as a built-in safety net, creating a higher base value for the token and protecting against catastrophic crashes.</li>
            <li>⚔️ Shorts Fund Longs: The losses from unsuccessful short positions directly contribute to strengthening the pool for long-term holders.</li>
            <li>🌀 The Flywheel: This mechanism ensures that market activity—whether from bulls or bears—continuously reinforces the ecosystem's health.</li>
          </ul>
           {/* Visual: Add a new step to the flywheel graphic:*/}
           <p>Image:Creator Earns Fees (SOL icon)

            Creator Reinvests (Arrow pointing back to the sol_reserve pool)

            Liquidity Grows (Pool gets larger)

            Price Floor Rises (Chart arrow pointing up)</p>
            <h3>The ecosystem gets stronger from two sides: automatically from market activity, and voluntarily from creator reinvestment.</h3>
        </div>
      </section>

      {/* The MemeLend Ecosystem */}
      <section className="features-grid">
        <h2>More Than Trading: Earn Yield from the Entire Market.</h2>
        <h3>Put your assets to work and earn real yield from every trade, short, and referral on the platform.</h3>
        <div className="feature-card">
          <h4>Flexible Staking (Earn SOL, Not More Tokens)</h4>
           {/* Icon: A vault with a SOL logo flowing out of it. */}
           <h3>Earn Real Yield in SOL</h3>
          <p>
            Stake your project tokens to earn a share of the interest paid by shorters. 
            Unlike other platforms, you're paid in native SOL, not more inflationary tokens. 
            This means real, spendable yield you can claim anytime and use anywhere—no lock-ups, no strings attached.
          </p>
          <ul>
            <li>🔄 Reinvest or Cash Out: Use your earned SOL to compound your position or take profits into any other asset.</li>
            <li>🔓 No Lock-ups: Unstake your tokens at any time. Your capital is never trapped.</li>
            <li>📈 Sustainable Yield: Yield is generated by actual market activity (shorting), not artificial inflation.</li>
          </ul>
        </div>
        <div className="feature-card">
          <h4>The Power of Referrals</h4>
           {/* Icon: Two people connecting, with a SOL symbol between them. */}
           <h3>Earn 50% of Platform Fees</h3>
          <p>
            Share MemeLend and get rewarded directly. 
            When you refer a friend, you earn 50% of the platform fees generated from all their trading activity—forever. 
            Your rewards are paid in SOL and are available to claim instantly, with no vesting periods.
          </p>
          <ul>
            <li>💰 50% Fee Share: A massively generous cut that rewards community growth.</li>
            <li>⚡ Claim Anytime: No vesting. Your earned fees are available the moment they are generated.</li>
            <li>📊 Sustainable Income: Build a stream of passive income by growing your network.</li>
          </ul>
        </div>
      </section>

      {/* Creator Section */}
      <section className="creators">
        <h2>A Better Launch for Creators, Too.</h2>
        <img src={oldWays} alt="" />
        <ul>
          <li>Build trust from day one by proving your liquidity is locked.</li>
          <li>Earn sustainable income from a percentage of all trades, forever.</li>
          <li>Attract serious traders, not just exit liquidity.</li>
        </ul>
      </section>
      <section className="creators">
        <h2>Reinvest & Grow. Together.</h2>
        {/* Icon: A circular arrow going into a growing chart. */}
        <p>Your success is your community's success. 
          As you earn fees from your token's trading volume, you can reinvest those SOL earnings directly back into the liquidity pool. 
          This isn't a cost—it's the ultimate show of good faith. Every deposit you make:</p>
        <ul>
          <li>Raises the price floor for all your holders.</li>
          <li>Builds unbreakable trust and demonstrates long-term commitment.</li>
          <li>Creates a virtuous cycle: A stronger pool attracts more traders, which generates more fees for you to reinvest.</li>
        </ul>
      </section>

      {/* Fees */}
      <section className="fees">
        <h2>Transparent Fees for Premium Protection.</h2>
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Creator Fee</th>
              <th>Platform Fee</th>
              <th>What You Get</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Buy</td>
              <td>0.5%</td>
              <td>1%</td>
              <td>Rug-proof tokens, market access</td>
            </tr>
            <tr>
              <td>Sell</td>
              <td>0.5%</td>
              <td>1%</td>
              <td>Secure exit, price stability</td>
            </tr>
            <tr>
              <td>Short/Close</td>
              <td>0.5%</td>
              <td>1%</td>
              <td>Unique shorting ability, risk management</td>
            </tr>
          </tbody>
        </table>
        <p className="fees-note">
          A small price to pay for a 100% reduction in rug pulls.
        </p>
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <h2>Ready to Trade on a Level Playing Field?</h2>
        <h3>Join the future of memecoin trading. No more scams. Just alpha.</h3>
        <div className="cta-group">
          <button className="btn btn-primary">Get Started Now</button>
          <button className="btn btn-secondary">Read the Docs</button>
          <button className="btn btn-secondary">Join our Discord</button>
          <button className="btn btn-secondary">Follow on X</button>
        </div>
      </section>
    </div>
  );
}

export default Welcome;
