import { useEffect } from 'react';

/**
 * Visualização em tela cheia de uma imagem — clique fora, botão ✕ ou Esc
 * fecham. Reaproveita o mesmo z-index/backdrop do Modal padrão
 * (.modal-overlay), mas sem cabeçalho/card branco: só a foto, inteira,
 * sem cortar (object-fit: contain, ao contrário da miniatura no card que
 * usa cover e corta a imagem pra caber no espaço).
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-overlay image-lightbox-overlay" onClick={onClose}>
      <button type="button" className="image-lightbox__close" aria-label="Fechar" onClick={onClose}>
        ✕
      </button>
      <img src={src} alt={alt} className="image-lightbox__image" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
