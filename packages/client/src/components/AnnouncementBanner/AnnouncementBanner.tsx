import { useEffect, useState } from 'react';
import { X, Info, AlertTriangle, AlertCircle, CheckCircle, Wrench, type LucideIcon } from 'lucide-react';
import { api } from '../../services/api';
import styles from './AnnouncementBanner.module.css';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  active: boolean;
  expires_at: string | null;
}

const ICONS: Record<string, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle,
  maintenance: Wrench,
};

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem('dismissed_announcements');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    api.announcements.getActive<{ announcements: Announcement[] }>()
      .then((data) => setAnnouncements(data.announcements ?? []))
      .catch(() => {});
  }, []);

  const dismiss = (id: string) => {
    const next = new Set([...dismissed, id]);
    setDismissed(next);
    sessionStorage.setItem('dismissed_announcements', JSON.stringify([...next]));
  };

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (!visible.length) return null;

  const ann = visible[0]!;
  const Icon = ICONS[ann.type] ?? Info;
  const typeClass = styles[ann.type as keyof typeof styles] ?? styles.info;

  return (
    <div className={`${styles.banner} ${typeClass}`} role="alert">
      <span className={styles.icon}>
        <Icon size={16} />
      </span>
      <span className={styles.content}>
        <span className={styles.title}>{ann.title}</span>
        {ann.content && ann.content !== ann.title && (
          <span className={styles.text}>— {ann.content}</span>
        )}
      </span>
      {visible.length > 1 && (
        <span style={{ opacity: 0.7, fontSize: 12 }}>{visible.length} annonces</span>
      )}
      <button className={styles.close} onClick={() => dismiss(ann.id)} aria-label="Fermer">
        <X size={14} />
      </button>
    </div>
  );
}
