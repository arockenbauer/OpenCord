import { FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import styles from './Auth.module.css';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError(t('auth.reset_error'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setIsLoading(true);
    try {
      await api.auth.resetPassword({ token, new_password: newPassword });
      setMessage(t('auth.reset_success'));
      setTimeout(() => navigate('/login'), 1200);
    } catch (err: any) {
      setError(err.message || t('auth.reset_error'));
    }
    setIsLoading(false);
  };

  return (
    <div className={styles.container}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.title}>{t('auth.reset_password')}</div>
        <div className={styles.subtitle}>Choisissez un nouveau mot de passe sécurisé.</div>
        {error && <div className={styles.error} data-testid="reset-password-error">{error}</div>}
        {message && <div style={{ color: 'var(--text-positive)', fontSize: '14px', marginBottom: '16px', textAlign: 'center' }} data-testid="reset-password-message">{message}</div>}

        <div className={styles.field}>
          <label className={styles.label}>{t('auth.new_password')}</label>
          <input className={styles.input} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} data-testid="reset-password-new" />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t('auth.confirm_password')}</label>
          <input className={styles.input} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} data-testid="reset-password-confirm" />
        </div>

        <button className={styles.submitButton} type="submit" disabled={isLoading} data-testid="reset-password-submit">
          {isLoading ? t('common.loading') : t('auth.reset_password_button')}
        </button>

        <div className={styles.footer}>
          <span className={styles.link} onClick={() => navigate('/login')}>{t('auth.login')}</span>
        </div>
      </form>
    </div>
  );
}
