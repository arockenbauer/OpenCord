import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import styles from './Auth.module.css';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      const data = await api.post<{ message: string }>('/auth/forgot-password', { email });
      setMessage(data.message);
    } catch (err: any) {
      setError(err.message || t('app.error'));
    }

    setIsLoading(false);
  };

  return (
    <div className={styles.container}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.title}>{t('auth.forgot_password')}</div>
        <div className={styles.subtitle}>Entrez votre email pour recevoir un lien de réinitialisation.</div>
        {error && <div className={styles.error}>{error}</div>}
        {message && <div style={{ color: 'var(--text-positive)', fontSize: '14px', marginBottom: '16px', textAlign: 'center' }}>{message}</div>}

        <div className={styles.field}>
          <label className={styles.label}>{t('auth.email')}</label>
          <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <button className={styles.submitButton} type="submit" disabled={isLoading}>
          {isLoading ? t('common.loading') : t('auth.reset_password_button')}
        </button>

        <div className={styles.footer}>
          <span className={styles.link} onClick={() => navigate('/login')}>{t('auth.login')}</span>
        </div>
      </form>
    </div>
  );
}
