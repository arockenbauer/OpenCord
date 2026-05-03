import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import styles from './StickerDisplay.module.css';

interface StickerDisplayProps {
  stickerIds: string;
}

export function StickerDisplay({ stickerIds }: StickerDisplayProps) {
  const [stickers, setStickers] = useState<any[]>([]);

  useEffect(() => {
    let parsedIds: string[] = [];
    try {
      parsedIds = JSON.parse(stickerIds);
    } catch {
      return;
    }
    if (parsedIds.length === 0) return;

    const loadStickers = async () => {
      try {
        const packs = await api.stickers.getPacks<any>();
        const allStickers = packs.packs?.flatMap((pack: any) => pack.stickers || []) || [];
        const matched = parsedIds
          .map((id) => allStickers.find((s: any) => s.id === id))
          .filter(Boolean);
        setStickers(matched);
      } catch (err) {
        console.error('Failed to load stickers for display:', err);
      }
    };

    loadStickers();
  }, [stickerIds]);

  if (stickers.length === 0) return null;

  return (
    <div className={styles.stickerContainer}>
      {stickers.map((sticker) => (
        <img
          key={sticker.id}
          src={sticker.asset || `/api/stickers/${sticker.id}/asset`}
          alt={sticker.name}
          className={styles.stickerImage}
          loading="lazy"
        />
      ))}
    </div>
  );
}
