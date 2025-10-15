interface RemoveStakeProps {
  position: any;
  onClose: () => void;
}

function RemoveStake({ position, onClose }: RemoveStakeProps) {
  return (
    <div>
        <button onClick={onClose}>Close</button>
    </div>
  )
}

export default RemoveStake