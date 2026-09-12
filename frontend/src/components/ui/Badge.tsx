import { useAuthedImage } from '../../api/useAuthedImage';
import { apiFileUrl } from '../../api/client';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const STATUS_TONE: Record<string, string> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = STATUS_LABELS[status] ?? status;
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

// Mapeia identificadores de ícone (backend) para um emoji exibível sem
// depender de nenhuma biblioteca de ícones no frontend — mesmo dicionário
// reaproveitado pelos avatares pré-definidos, pelas modalidades e pelas
// conquistas (Achievement.icon quando iconType='EMOJI').
const PRESET_ICON_EMOJI: Record<string, string> = {
  // Avatares pré-definidos (ProfileService.AVATAR_PRESETS)
  fox: '🦊',
  bird: '🐦',
  rocket: '🚀',
  footprints: '👣',
  bike: '🚴',
  'book-open': '📖',
  flower: '🌸',
  trophy: '🏆',
  // Modalidades (ActivityType.icon) e conquistas geradas a partir delas
  dumbbell: '🏋️',
  run: '🏃',
  'heart-pulse': '🧘',
  // Conquistas nomeadas/transversais (Achievement.icon)
  award: '🏅',
  'shield-check': '🛡️',
  flame: '🔥',
  gem: '💎',
  star: '⭐',
  medal: '🥉',
  crown: '👑',
  compass: '🧭',
  sparkles: '✨',
  clock: '🕐',
  cake: '🎂',
};

/** Emoji exibível pra um identificador de ícone — usado quando não há um
 * mapeamento mais específico (ex.: componentes de conquista/modalidade). */
export function emojiForIcon(icon: string): string {
  return PRESET_ICON_EMOJI[icon] ?? '🏆';
}

/** Ícone de uma conquista — emoji/identificador (iconType='EMOJI') ou a
 * imagem enviada pelo admin (iconType='UPLOAD'). O catálogo de conquistas é
 * público, então a imagem é servida sem autenticação (não precisa do
 * useAuthedImage usado pelo avatar). */
export function AchievementIcon({ icon, iconType, size = 40 }: { icon: string; iconType: string; size?: number }) {
  if (iconType === 'UPLOAD') {
    return <img src={apiFileUrl(icon)} alt="" className="achievement-icon achievement-icon--photo" style={{ width: size, height: size }} />;
  }
  return (
    <span className="achievement-icon" style={{ width: size, height: size, fontSize: size * 0.6, lineHeight: `${size}px` }} aria-hidden="true">
      {emojiForIcon(icon)}
    </span>
  );
}

interface AvatarProps {
  name: string;
  size?: number;
  /** Quando informados, sobrepõem as iniciais com o avatar real do usuário. */
  avatarType?: string;
  avatarUrl?: string | null;
  userId?: string;
}

export function Avatar({ name, size = 36, avatarType, avatarUrl, userId }: AvatarProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  const style = { width: size, height: size, fontSize: size * 0.5 };

  if (avatarType === 'UPLOAD' && userId) {
    return <UploadedAvatar userId={userId} fallbackInitials={initials || '?'} size={size} />;
  }

  if (avatarType === 'PRESET' && avatarUrl && PRESET_ICON_EMOJI[avatarUrl]) {
    return (
      <div className="avatar" style={style} aria-hidden="true">
        {PRESET_ICON_EMOJI[avatarUrl]}
      </div>
    );
  }

  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {initials || '?'}
    </div>
  );
}

function UploadedAvatar({ userId, fallbackInitials, size }: { userId: string; fallbackInitials: string; size: number }) {
  const { url } = useAuthedImage(`/profile/${userId}/avatar`);

  if (!url) {
    return (
      <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
        {fallbackInitials}
      </div>
    );
  }

  return <img src={url} alt="" className="avatar avatar--photo" style={{ width: size, height: size }} />;
}
