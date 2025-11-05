import React from "react";
import "../../styles/social_media/ShareModal.css";
import { X } from "lucide-react";

type ShareModalProps = {
  show: boolean;
  onClose: () => void;
  title: string;        
  message: string;      
  tokenName?: string;   
  url: string;          
};

export default function ShareModal({ show, onClose, title, message, tokenName, url }: ShareModalProps) {
    
  if (!show) return null;

  const tweetText = encodeURIComponent(
    `${message}\n${url}`
  );

  return (
    <div className="share-modal-backdrop">
      <div className="share-modal">
        <button className="close-btn" onClick={onClose}>
          <X size={18} />
        </button>

        <h3 className="share-title">{title}</h3>

        <div className="share-buttons">
          <a
            href={`https://twitter.com/intent/tweet?text=${tweetText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="share-btn twitter"
          >
            Share on X
          </a>
        </div>
      </div>
    </div>
  );
}
