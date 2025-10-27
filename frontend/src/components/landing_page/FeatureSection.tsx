import "../../styles/landing_page/featureSections.css";

function FeatureSection() {
  return (
    <>
      <h2 className="how-it-work-title">MemeLend Features — Fair, Transparent, and Built for Growth</h2>

      <div className="how-it-work-cards-frame">

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">lock_open</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">Non-Custodial</h3>
            <p className="how-it-work-cards-content-text">
              You keep full control of your assets at all times. MemeLend operates on-chain — your funds never leave your wallet unless you authorize it.
            </p>
          </div>
        </div>

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">no_accounts</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">No KYC</h3>
            <p className="how-it-work-cards-content-text">
              Trade freely with complete privacy. No forms, no approvals — just connect your wallet and start building.
            </p>
          </div>
        </div>

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">verified_user</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">Smart Contract-Locked Liquidity</h3>
            <p className="how-it-work-cards-content-text">
              All liquidity is secured by audited smart contracts — fully transparent and immune to rug pulls.
            </p>
          </div>
        </div>

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">account_balance</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">Staking & Yield</h3>
            <p className="how-it-work-cards-content-text">
              Stake your tokens to earn real yield in SOL — powered by trading activity across your token’s market.
            </p>
          </div>
        </div>

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">handshake</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">Presale for Funding</h3>
            <p className="how-it-work-cards-content-text">
              Launch your presale to raise WSOL liquidity. Early supporters share in creator fees for as long as they hold their presale tokens.
            </p>
          </div>
        </div>

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">candlestick_chart</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">Full Trading Suite</h3>
            <p className="how-it-work-cards-content-text">
              Buy, sell, short, or close short positions — all seamlessly within MemeLend’s DeFi trading ecosystem.
            </p>
          </div>
        </div>

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">sync_saved_locally</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">Reinforced Bonding Curve</h3>
            <p className="how-it-work-cards-content-text">
              Failed shorts feed their collateral back into liquidity, strengthening the reserve and naturally increasing token value over time.
            </p>
          </div>
        </div>

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">group_add</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">Referral Rewards</h3>
            <p className="how-it-work-cards-content-text">
              Invite others to MemeLend and earn SOL rewards whenever they trade, stake, or short. Grow your network — and your yield.
            </p>
          </div>
        </div>

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">token</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">Token Launch & Split Allocation</h3>
            <p className="how-it-work-cards-content-text">
              MemeLend automatically splits your token supply between lending and liquidity vaults — building a strong foundation from day one.
            </p>
          </div>
        </div>

        <div className="how-it-work-cards">
          <div className="how-it-work-cards-title">
            <span className="material-symbols-outlined">trending_up</span>
          </div>
          <div className="how-it-work-cards-content">
            <h3 className="how-it-work-cards-content-subtitle">Built for Passive Income</h3>
            <p className="how-it-work-cards-content-text">
              Earn from day one — rewards are unlocked instantly, giving you full flexibility to withdraw or reinvest anytime.
            </p>
          </div>
        </div>

      </div>
    </>
  )
}

export default FeatureSection
