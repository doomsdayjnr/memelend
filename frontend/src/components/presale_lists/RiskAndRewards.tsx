

function RiskAndRewards() {
  return (
    <>
        <h2>📜 Presale Terms: Risks / Rewards / Rules</h2>
        <div className="presale-terms">
            <div className='presale-risks'>
            <label htmlFor="">⚖️ Risks</label>
            <ul>
                <li><strong>No Guaranteed Launch Price:</strong> Presale entry price <strong>may be higher or lower</strong> than the token’s launch price.</li>
                <li><strong>Market Volatility:</strong> Token value depends on bonding curve + demand.</li>
                <li><strong>Liquidity Risk:</strong> Selling early may affect price and reduce your returns.</li>
            </ul>
            </div>
            <div className='presale-rewards'>
            <label htmlFor="">💎 Rewards</label>
            <ul>
                <li><strong>Fee Share:</strong> Presale holders receive <strong>50% of the creator’s 0.5% fee allocation</strong> (0.25% of all trades).</li>
                <li><strong>Staking Boost:</strong> By staking your presale tokens, you also earn <strong>staking yield fees</strong> on top of fee share.</li>
                <li><strong>Higher Earning Potential:</strong> Presale users enjoy <strong>dual income streams</strong> (trading fees + staking) that regular holders don’t.</li>
                <li><strong>Early Access:</strong> Once presale is sold out, no new wallets can join this reward pool.</li>
            </ul>
            </div>
            <div className='presale-rules'>
            <label htmlFor="">📏 Rules</label>
            <ul>
                <li>Presale holders keep earning their <strong>fee share (0.25% of all trades)</strong> as long as they hold their presale tokens.</li>
                <li><strong>Staking rewards are optional:</strong> presale holders must stake their tokens in the staking pool to earn additional yield.</li>
                <li><strong>Selling presale tokens</strong> means you forfeit all future rewards (but keep what you already earned up to that point).</li>
                <li>Once <strong>all presale tokens are sold off</strong>, the <strong>creator regains the full 0.5% fee allocation</strong>.</li>
                <li><strong>Rewards don’t transfer</strong>if you send your presale tokens to another wallet — only the original holder earns future rewards.</li>
            </ul>
            </div>
        </div>
    </>
  )
}

export default RiskAndRewards