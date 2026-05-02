import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import styles from './Auth.module.css';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, twoFactorLogin, error, isLoading, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactor, setTwoFactor] = useState(false);
  const [partialToken, setPartialToken] = useState('');
  const [code, setCode] = useState('');

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      const result = await login(email, password);
      if (result.twoFactorRequired && result.partialToken) {
        setTwoFactor(true);
        setPartialToken(result.partialToken);
      } else {
        navigate('/channels/@me');
      }
    } catch { /* error handled by store */ }
  };

  const handle2FA = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await twoFactorLogin(code, partialToken);
      navigate('/channels/@me');
    } catch { /* error handled by store */ }
  };

  if (twoFactor) {
    return (
      <div className={styles.container}>
        <form className={styles.card} onSubmit={handle2FA}>
          <div className={styles.title}>{t('auth.two_factor_title')}</div>
          <div className={styles.subtitle}>{t('auth.two_factor_subtitle')}</div>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.field}>
            <label className={styles.label}>{t('auth.two_factor_code')}</label>
            <input className={styles.input} type="text" value={code} onChange={(e) => setCode(e.target.value)} autoFocus maxLength={6} />
          </div>
          <button className={styles.submitButton} type="submit" disabled={isLoading}>
            {isLoading ? t('common.loading') : t('auth.two_factor_submit')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <form className={styles.card} onSubmit={handleLogin}>
        <div className={styles.title}>{t('auth.login')}</div>
        <div className={styles.subtitle}>{t('auth.welcome_back')}</div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.label}>{t('auth.email')}</label>
          <input className={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t('auth.password')}</label>
          <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <button className={styles.submitButton} type="submit" disabled={isLoading}>
          {isLoading ? t('common.loading') : t('auth.login_button')}
        </button>

        <div className={styles.footer}>
          <span className={styles.link} onClick={() => navigate('/forgot-password')}>{t('auth.forgot_password')}</span>
        </div>

        <div className={styles.footer}>
          {t('auth.no_account')} <span className={styles.link} onClick={() => navigate('/register')}>{t('auth.register')}</span>
        </div>
      </form>
    </div>
  );
}
