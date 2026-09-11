import multilogIcon from '../../assets/multilog-icon.png';

/** Logo "Dados Competição" — ícone oficial da marca (arquivo enviado pelo
 * usuário, em frontend/src/assets/) mais o nome por extenso. Substitui o
 * antigo "🏔️ Torre" em todo o app. */
export function Logo({ iconSize = 24 }: { iconSize?: number }) {
  return (
    <span className="brand-logo">
      <img
        src={multilogIcon}
        alt=""
        aria-hidden="true"
        className="brand-logo__icon"
        style={{ width: iconSize, height: iconSize }}
      />
      <span>Dados Competição</span>
    </span>
  );
}
