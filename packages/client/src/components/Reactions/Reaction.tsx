import { useState } from 'react';
import styles from './Reactions.module.css';

interface ReactionProps {
  emoji: string;
  count: number;
  burstCount?: number;
  burstColors?: string[];
  meReacted?: boolean;
  meBurst?: boolean;
  onClick: () => void;
}

export function Reaction({ emoji, count, burstCount = 0, burstColors = ["#7c3aed","#a855f7","#d946ef"], meReacted, meBurst, onClick }: ReactionProps) {
  const [isBursting, setIsBursting] = useState(false);

  const handleClick = () => {
    if (!meReacted || (meReacted && !meBurst)) {
      setIsBursting(true);
      setTimeout(() => setIsBursting(false), 1000);
    }
    onClick();
  };

  const showBurst = burstCount > 0;
  const displayCount = showBurst ? burstCount : count;

  return (
    <div
      className={`${styles.reaction} ${meReacted ? styles.reacted : ''} ${isBursting ? styles.bursting : ''}`}
      onClick={handleClick}
      title={showBurst ? `Super réaction (${burstCount})` : `Réaction (${count})`}
    >
      {showBurst && isBursting && (
        <div className={styles.burstParticles}>
          {burstColors.map((color, i) => (
            <div
              key={i}
              className={styles.particle}
              style={{
                '--particle-color': color,
                '--particle-delay': `${i * 0.1}s`,
                '--particle-angle': `${(360 / burstColors.length) * i}deg`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}
      <span className={styles.emoji}>{emoji}</span>
      {displayCount > 0 && (
        <span className={`${styles.count} ${meBurst ? styles.burstCount : ''}`}>{displayCount}</span>
      )}
    </div>
  );
}
