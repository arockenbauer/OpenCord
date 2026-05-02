import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, modalStyles } from './Modal';
import { useGuildStore } from '../../stores/guildStore';
import { useUIStore } from '../../stores/uiStore';

export function CreateGuildModal() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const createGuild = useGuildStore((s) => s.createGuild);
  const selectGuild = useGuildStore((s) => s.selectGuild);
  const setShowCreateGuild = useUIStore((s) => s.setShowCreateGuild);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const guild = await createGuild(name.trim());
      selectGuild(guild.id);
      setShowCreateGuild(false);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <Modal onClose={() => setShowCreateGuild(false)}>
      <div className={modalStyles.title}>{t('guild.create')}</div>
      <div className={modalStyles.subtitle}>Donnez un nom à votre serveur pour commencer.</div>

      {error && <div className={modalStyles.error}>{error}</div>}

      <div className={modalStyles.field}>
        <label className={modalStyles.label}>{t('guild.create_name')}</label>
        <input
          className={modalStyles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Mon Serveur"
          autoFocus
        />
      </div>

      <button className={modalStyles.buttonPrimary} onClick={handleSubmit} disabled={loading || !name.trim()}>
        {loading ? t('common.loading') : t('guild.create')}
      </button>
    </Modal>
  );
}
