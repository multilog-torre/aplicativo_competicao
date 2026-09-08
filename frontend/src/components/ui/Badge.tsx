import { useAuthedImage } from '../../api/useAuthedImage';

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

// Mapeia o ícone dos avatares pré-definidos (backend) para um emoji exibível
// sem depender de nenhuma biblioteca de ícones no frontend.
const PRESET_ICON_EMOJI: Record<string, string> = {
  fox: '🦊',
  bird: '🐦',
  rocket: '🚀',
  footprints: '👣',
  bike: '🚴',
  'book-open': '📖',
  flower: '🌸',
  trophy: '🏆',
};

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
