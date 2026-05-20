import { ReactNode, useEffect, useRef } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  contentClassName?: string;
  title?: string;
}

export function Modal({ onClose, children, contentClassName, title }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;

    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);

    // Focus trap
    const modal = modalRef.current;
    if (modal) {
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) focusable[0]?.focus();

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      const trap = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      };
      modal.addEventListener('keydown', trap);
      return () => {
        document.removeEventListener('keydown', handler);
        modal.removeEventListener('keydown', trap);
        previousFocus.current?.focus();
      };
    }

    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={modalRef}
        className={contentClassName ? `${styles.modal} ${contentClassName}` : styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Modal'}
      >
        {title && <h2 id="modal-title" className={styles.modalTitle}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export { styles as modalStyles };
