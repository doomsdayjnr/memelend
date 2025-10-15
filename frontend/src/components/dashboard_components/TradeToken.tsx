interface TradeTokenProps {
  position: any;
  onClose: () => void;
}
function TradeToken({ position, onClose }: TradeTokenProps) {
  return (
    <div>
        <button onClick={onClose}>Close</button>
    </div>
  )
}

export default TradeToken