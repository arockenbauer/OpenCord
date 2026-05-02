import { ReactNode, useEffect } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  contentClassName?: string;
}

export function Modal({ onClose, children, contentClassName }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={contentClassName ? `${styles.modal} ${contentClassName}` : styles.modal}>{children}</div>
    </div>
  );
}

export { styles as modalStyles };
