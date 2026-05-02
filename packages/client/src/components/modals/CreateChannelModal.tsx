import { useState } from 'react';
import { Hash, Volume2, Megaphone, Radio, MessageSquare, Lock, ChevronRight, Folder } from 'lucide-react';
import { Modal, modalStyles } from '../Modal/Modal';
import { useGuildStore } from '../../stores/guildStore';
import { api } from '../../services/api';

const CHANNEL_TYPES = [
  {
    type: 0,
    name: 'Texte',
    icon: Hash,
    description: 'Envoyez des messages, des images, des GIF, des emojis, des opinions et des blagues',
  },
  {
    type: 2,
    name: 'Vocal',
    icon: Volume2,
    description: 'Rejoignez un salon vocal et discutez avec d\'autres membres',
  },
  {
    type: 4,
    name: 'Catégorie',
    icon: Folder,
    description: 'Organisez vos salons textuels, vocaux et forums dans une section dédiée',
  },
  {
    type: 5,
    name: 'Annonces',
    icon: Megaphone,
    description: 'Publiez des mises à jour importantes que les membres peuvent suivre',
  },
  {
    type: 13,
    name: 'Conférence',
    icon: Radio,
    description: 'Organisez des événements audio avec des membres sélectionnés',
  },
  {
    type: 15,
    name: 'Forum',
    icon: MessageSquare,
    description: 'Créez des fils de discussion pour des sujets spécifiques',
  },
];

interface Channel {
  id: string;
  guild_id: string | null;
  name: string;
  type: number;
  position: number;
  topic: string | null;
  nsfw: boolean;
  parent_id: string | null;
  last_message_id: string | null;
  slowmode_delay: number;
  [key: string]: any;
}

interface CreateChannelModalProps {
  guildId: string;
  categoryId?: string;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}

export function CreateChannelModal({ guildId, categoryId, onClose, onCreated }: CreateChannelModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState(0);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [nsfw, setNsfw] = useState(false);
  const [slowmode, setSlowmode] = useState(0);
  const [userLimit, setUserLimit] = useState(0);
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const addChannel = useGuildStore((s) => s.addChannel);

  const handleNameChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
    setName(sanitized);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Le nom du salon est requis.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        type: selectedType,
        parent_id: selectedType === 4 ? null : categoryId || null,
        nsfw,
      };
      if (topic && [0, 5].includes(selectedType)) body.topic = topic;
      if (slowmode > 0 && [0, 5].includes(selectedType)) body.slowmode_delay = slowmode;
      if (selectedType === 2 && userLimit > 0) body.user_limit = userLimit;
      if (isPrivate) body.permission_overwrites = [];

      const channel = await api<Channel>(`/api/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      addChannel(guildId, channel);
      onCreated(channel);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création du salon');
    }
    setLoading(false);
  };

  const selectedChannelType = CHANNEL_TYPES.find((ct) => ct.type === selectedType);
  const isTextLike = [0, 5].includes(selectedType);
  const isVoice = selectedType === 2;
  const isCategory = selectedType === 4;

  return (
    <Modal onClose={onClose}>
      {step === 1 ? (
        <div>
          <div className={modalStyles.title}>Créer un salon</div>
          <div className={modalStyles.subtitle}>
            {selectedType === 4 ? 'Une catégorie organise plusieurs salons' : categoryId ? 'Dans la catégorie sélectionnée' : 'Sans catégorie'}
          </div>

          <div className={modalStyles.field}>
            <div className={modalStyles.label}>Type de salon</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {CHANNEL_TYPES.map((ct) => {
                const Icon = ct.icon;
                return (
                  <button
                    key={ct.type}
                    onClick={() => setSelectedType(ct.type)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '8px',
                      textAlign: 'left',
                      background: selectedType === ct.type ? 'var(--bg-modifier-selected)' : 'var(--bg-tertiary)',
                      border: selectedType === ct.type ? '1px solid var(--bg-accent)' : '1px solid transparent',
                      transition: 'all 150ms',
                    }}
                  >
                    <Icon size={20} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{ct.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{ct.description}</div>
                    </div>
                    {selectedType === ct.type && <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={modalStyles.actions}>
            <button className={modalStyles.buttonSecondary} onClick={onClose}>Annuler</button>
            <button className={modalStyles.buttonPrimary} onClick={() => setStep(2)}>
              Suivant
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className={modalStyles.title}>
            Créer un salon {selectedChannelType?.name.toLowerCase()}
          </div>

          {error && <div className={modalStyles.error}>{error}</div>}

          <div className={modalStyles.field}>
            <label className={modalStyles.label}>
              Nom du salon
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              {selectedChannelType && (
                <selectedChannelType.icon
                  size={16}
                  style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }}
                />
              )}
              <input
                className={modalStyles.input}
                style={{ paddingLeft: '32px' }}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="nouveau-salon"
                autoFocus
              />
            </div>
          </div>

          {isTextLike && (
            <div className={modalStyles.field}>
              <label className={modalStyles.label}>Sujet (optionnel)</label>
              <input
                className={modalStyles.input}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Décrivez ce salon…"
                maxLength={1024}
              />
            </div>
          )}

          {isTextLike && (
            <div className={modalStyles.field}>
              <label className={modalStyles.label}>Ralentissement (secondes)</label>
              <input
                className={modalStyles.input}
                type="number"
                min={0}
                max={21600}
                value={slowmode}
                onChange={(e) => setSlowmode(Number(e.target.value))}
              />
            </div>
          )}

          {isVoice && (
            <div className={modalStyles.field}>
              <label className={modalStyles.label}>Limite d'utilisateurs (0 = illimité)</label>
              <input
                className={modalStyles.input}
                type="number"
                min={0}
                max={99}
                value={userLimit}
                onChange={(e) => setUserLimit(Number(e.target.value))}
              />
            </div>
          )}

          {!isCategory && (
            <div className={modalStyles.field}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <Lock size={16} style={{ color: 'var(--text-muted)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Salon privé</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Seuls les membres avec accès peuvent le voir</div>
                </div>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
              </label>
            </div>
          )}

          {isTextLike && (
            <div className={modalStyles.field}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>NSFW</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Contenu réservé aux adultes</div>
                </div>
                <input
                  type="checkbox"
                  checked={nsfw}
                  onChange={(e) => setNsfw(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
              </label>
            </div>
          )}

          <div className={modalStyles.actions}>
            <button className={modalStyles.buttonSecondary} onClick={() => setStep(1)}>Retour</button>
            <button className={modalStyles.buttonPrimary} onClick={handleCreate} disabled={loading || !name.trim()}>
              {loading ? 'Création…' : 'Créer le salon'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
