
function ReinforcedBondingCurve() {
  return (
    <>
      {/* COMPARISON SECTION */}
      <section className="curve-section">
        <h1 className="section-title">The Reinforced Bonding Curve</h1>
        <p className="section-subtitle">
          MemeLend's innovative bonding curve is engineered to provide superior liquidity
          and price stability compared to traditional models, fostering a healthier
          and more sustainable token ecosystem.
        </p>

        <div className="curve-comparison">
          <div className="curve-box">
            <span className="material-symbols-outlined red-trend">trending_down</span>
            <h3>Traditional Bonding Curve</h3>
            <p className="text-white/70 text-base font-normal leading-relaxed"> 
              Prone to sharp price volatility and liquidity drains, 
              creating an unstable environment for traders and holders. 
              It often leads to pump-and-dump scenarios. 
            </p>
          </div>

          <div className="curve-box">
            <span className="material-symbols-outlined green-trend">trending_up</span>
            <h3>MemeLend’s Reinforced Curve</h3>
            <p className="text-white/70 text-base font-normal leading-relaxed"> 
              Our model reinforces liquidity with every trade, ensuring price stability and sustainable growth. 
              This builds a robust foundation for long-term value and community trust. 
            </p>
          </div>
        </div>
      </section>
    </>
  )
}

export default ReinforcedBondingCurve