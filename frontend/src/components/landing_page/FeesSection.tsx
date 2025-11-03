import "../../styles/landing_page/feesSection.css";
import { Link } from "react-router-dom";

function FeesSection() {
  return (
    <div className="fees-container">
        <div className="fees-title-frame">
            <div className="fees-title-frame-content">
                <p className="fees-title">Built for Long-Term Sustainability</p>
                <p className="fees-subtitle">
                    A small 1.5% fee on every trade powers MemeLend’s rewards, protection, and growth — ensuring a safer, more rewarding trading experience for everyone.
                    <br/><br/>
                    MemeLend fees are fully transparent and dynamically distributed depending on how a token is launched or traded. 
                    Every scenario still totals just 1.5%, ensuring fairness while rewarding participation and sustaining the ecosystem.
                </p>
            </div>
        </div>
        <div className="fees-table-container">
            <div className="fees-structure-frame-my-table">
                <table>
                    <thead>
                        <tr>
                            <th>Scenario</th>
                            <th>Creator</th>
                            <th>Presale Holders</th>
                            <th>Platform</th>
                            <th>Referrer</th>
                            <th>Yield</th>
                            <th>Liquidator</th>
                            <th>Total Fees</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="table-content-row-frames">
                            <td>Creator + Liquidity (with Referrer)</td>
                            <td>0.5%</td>
                            <td>❌</td>
                            <td>0.5%</td>
                            <td>0.4%</td>
                            <td>0.1%</td>
                            <td>❌</td>
                            <td>1.5%</td>
                            <td>
                                Liquidity providers earn 0.5% of every trade — fueling creator growth from day one.
                                The platform fee (1%) is efficiently reinvested into adoption: 
                                0.4% rewards referrers who help expand the ecosystem, and 
                                0.1% powers yield rewards for active participants. 
                                This model boosts creator earnings, community growth, and long-term sustainability — 
                                all while keeping total fees at just 1.5%.
                            </td>
                        </tr>
                        <tr className="table-content-row-frames">
                            <td>Creator + Liquidity (without Referrer)</td>
                            <td>0.5%</td>
                            <td>❌</td>
                            <td>0.8%</td>
                            <td>❌</td>
                            <td>0.2%</td>
                            <td>❌</td>
                            <td>1.5%</td>
                            <td>
                                Creators earn 0.5% of every trade when they provide liquidity — 
                                maximizing their long-term upside. 
                                With no referrer involved, the platform directs 0.2% of its 1% fee 
                                into yield rewards, boosting liquidity depth and rewarding active holders. 
                                The remaining fee supports ongoing development, stability, and continued ecosystem expansion — 
                                all while keeping total fees at only 1.5%.
                            </td>
                        </tr>
                        <tr className="table-content-row-frames">
                            <td>Presale Option (with Referrer)</td>
                            <td>0.25%</td>
                            <td> 0.25%</td>
                            <td>0.5%</td>
                            <td>0.4%</td>
                            <td>0.1%</td>
                            <td>❌</td>
                            <td>1.5%</td>
                            <td>
                                In the presale route, both the creator and early supporters benefit — 
                                each earning 0.25% from every trade as the token gains traction.  
                                Referrers are rewarded with 0.4% for expanding the community, while 
                                0.1% fuels ongoing yield rewards for holders.  
                                This model strengthens early confidence, drives adoption, and ensures 
                                everyone who helped launch the token shares in its long-term success — 
                                all within the same low 1.5% total fee.
                            </td>
                        </tr>
                        <tr className="table-content-row-frames">
                            <td>Presale Option (without Referrer)</td>
                            <td>0.25%</td>
                            <td>0.25%</td>
                            <td>0.8%</td>
                            <td>❌</td>
                            <td>0.2%</td>
                            <td>❌</td>
                            <td>1.5%</td>
                            <td>
                                In this presale scenario without a referrer, the creator and early supporters 
                                each earn 0.25% from every trade, sharing in the token’s initial growth.  
                                The platform retains 0.8% of fees, with 0.2% allocated to yield rewards for active holders,  
                                ensuring liquidity remains strong and the ecosystem continues to thrive.  
                                Total fees remain transparent and capped at 1.5%, fostering fairness and sustainability for all participants.
                            </td>
                        </tr>
                        <tr className="table-content-row-frames">
                            <td>Liquidation</td>
                            <td>❌</td>
                            <td>❌</td>
                            <td>❌</td>
                            <td>❌</td>
                            <td>0.5%</td>
                            <td>0.5%</td>
                            <td>1% (from collateral)</td>
                            <td>
                                When a short position is liquidated, 1% of the collateral is allocated evenly between 
                                the yield pool and the liquidator, rewarding active participants.  
                                The remaining collateral is added to the SOL reserve, reinforcing the token’s price floor 
                                and strengthening the overall ecosystem.  
                                This mechanism ensures market activity directly contributes to long-term stability and value.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <div className="fees-call-for-action-frame">
            <div className="fees-call-for-action-content">
                <h2 className="fees-call-for-action-title">
                    Join MemeLend to access a transparent, secure, and thriving token ecosystem.  
                    Back projects you believe in — from innovative, utility-driven tokens to community-driven experiments — 
                    all while removing rug-pull risk and unlocking new opportunities for growth.
                </h2>
                <div className="call-for-action-btn-frame">
                    <Link to="/launch" className="call-for-action-btn">Launch Your Token</Link>
                </div>
            </div>
        </div>
    </div>
  )
}

export default FeesSection