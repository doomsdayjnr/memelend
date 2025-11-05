import { useEffect, useState } from "react";

function PresaleCountdown({ start, end }: { start: string; end: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [status, setStatus] = useState<"upcoming" | "active" | "ended">("upcoming");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    // console.log("PresaleCountdown startDate:", startDate, "endDate:", endDate);

    const update = () => {
      const now = new Date();

      if (now < startDate) {
        setStatus("upcoming");
        const diff = startDate.getTime() - now.getTime();
        setTimeLeft(formatTimeDiff(diff));
        setIsUrgent(diff <= 3600 * 1000); // less than 1h until start
      } else if (now >= startDate && now <= endDate) {
        setStatus("active");
        const diff = endDate.getTime() - now.getTime();
        setTimeLeft(formatTimeDiff(diff));
        setIsUrgent(diff <= 3600 * 1000); // less than 1h until end
      } else {
        setStatus("ended");
        setTimeLeft("00h:00m:00s");
        setIsUrgent(false);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [start, end]);

  const formatTimeDiff = (ms: number) => {
    if (ms <= 0) return "00h:00m:00s";

    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d:${String(hours).padStart(2, "0")}h:${String(minutes).padStart(
        2,
        "0"
      )}m:${String(seconds).padStart(2, "0")}s`;
    }

    return `${String(hours).padStart(2, "0")}h:${String(minutes).padStart(
      2,
      "0"
    )}m:${String(seconds).padStart(2, "0")}s`;
  };

  return (
    <div className="presale-countdown">
      {status === "upcoming" && (
        <span className={isUrgent ? "urgent" : ""}>Presale Starts In: {timeLeft}</span>
      )}
      {status === "active" && (
        <span className={isUrgent ? "urgent" : ""}>Presale Ends In: {timeLeft}</span>
      )}
      {status === "ended" && <span>Presale Ended</span>}
    </div>
  );
}

export default PresaleCountdown;
