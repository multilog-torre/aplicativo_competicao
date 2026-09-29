import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { EmojiClickData, Theme } from 'emoji-picker-react';
import { useTheme } from '../../context/ThemeContext';
import { LoadingState } from './States';

// Carregado sob demanda (só quando o seletor abre pela primeira vez) — a
// biblioteca embute o dicionário completo de emojis e pesaria ~300KB extra
// no bundle principal se importada no topo do arquivo.
const EmojiPicker = lazy(() => import('emoji-picker-react'));

export interface ReactionSummaryItem {
  emoji: string;
  count: number;
}

interface ReactionPickerProps {
  reactionsSummary: ReactionSummaryItem[];
  myReaction: string | null;
  onReact: (emoji: string) => void;
  onRemove: () => void;
}

/**
 * Barra de reações reutilizada por post e comentário: mostra um chip por
 * emoji já usado (com contagem) mais um botão "+" que abre o seletor
 * completo de emojis (qualquer emoji do Unicode, com busca — emoji-picker-react).
 * Clicar num chip que já é a própria reação remove; clicar em outro chip ou
 * escolher no seletor troca.
 */
export function ReactionPicker({ reactionsSummary, myReaction, onReact, onRemove }: ReactionPickerProps) {
  const { theme } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);

  function handleChipClick(emoji: string) {
    if (emoji === myReaction) onRemove();
    else onReact(emoji);
  }

  function handleEmojiSelect(data: EmojiClickData) {
    onReact(data.emoji);
    setPickerOpen(false);
  }

  return (
    <div className="reaction-picker" ref={wrapperRef}>
      {reactionsSummary.map(({ emoji, count }) => (
        <button
          key={emoji}
          type="button"
          className={`reaction-picker__chip ${emoji === myReaction ? 'reaction-picker__chip--active' : ''}`}
          onClick={() => handleChipClick(emoji)}
          title={emoji === myReaction ? 'Remover reação' : 'Reagir com este emoji'}
        >
          <span aria-hidden="true">{emoji}</span>
          <span className="reaction-picker__chip-count">{count}</span>
        </button>
      ))}

      <button
        type="button"
        className="reaction-picker__add"
        aria-label="Adicionar reação"
        title="Adicionar reação"
        onClick={() => setPickerOpen((v) => !v)}
      >
        {myReaction && !reactionsSummary.some((r) => r.emoji === myReaction) ? myReaction : '😊'}
        <span className="reaction-picker__add-plus">+</span>
      </button>

      {pickerOpen && (
        <div className="reaction-picker__popover">
          <Suspense fallback={<div className="reaction-picker__popover-loading"><LoadingState label="Carregando emojis…" /></div>}>
            <EmojiPicker
              onEmojiClick={handleEmojiSelect}
              theme={(theme === 'dark' ? 'dark' : 'light') as Theme}
              searchDisabled={false}
              skinTonesDisabled
              width={300}
              height={360}
              previewConfig={{ showPreview: false }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
