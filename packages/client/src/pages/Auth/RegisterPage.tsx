import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import styles from './Auth.module.css';

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { register, error, isLoading, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await register({ email, username, password, date_of_birth: dob });
      navigate('/channels/@me');
    } catch { /* error handled by store */ }
  };

  return (
    <div className={styles.container}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.title}>{t('auth.register')}</div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.label}>{t('auth.email')}</label>
          <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t('auth.username')}</label>
          <input className={styles.input} type="text" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} maxLength={32} />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t('auth.password')}</label>
          <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t('auth.date_of_birth')}</label>
          <input className={styles.input} type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
        </div>

        <button className={styles.submitButton} type="submit" disabled={isLoading}>
          {isLoading ? t('common.loading') : t('auth.register_button')}
        </button>

        <div className={styles.footer}>
          {t('auth.has_account')} <span className={styles.link} onClick={() => navigate('/login')}>{t('auth.login')}</span>
        </div>
      </form>
    </div>
  );
}
