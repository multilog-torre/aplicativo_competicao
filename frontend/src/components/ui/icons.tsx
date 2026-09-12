/**
 * Ícone "padrão" da seção Participantes — glifo de grupo de pessoas escolhido
 * pelo usuário, em SVG (não emoji) justamente pra poder pintar de laranja
 * escuro via `currentColor`/CSS, o que um emoji não permite (emoji sempre
 * renderiza com as próprias cores fixas). Usado tanto no item do menu lateral
 * quanto em qualquer estado vazio da própria seção — um único lugar pra trocar
 * caso o desenho mude no futuro.
 */
export function ParticipantsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg className="icon-participants" viewBox="0 0 640 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M96 224c35.3 0 64-28.7 64-64s-28.7-64-64-64s-64 28.7-64 64s28.7 64 64 64zm448 0c35.3 0 64-28.7 64-64s-28.7-64-64-64s-64 28.7-64 64s28.7 64 64 64zm32 32h-64c-17.6 0-33.5 7.1-45.1 18.6c40.3 22.1 68.9 62 75.1 109.4h66c17.7 0 32-14.3 32-32v-32c0-35.3-28.7-64-64-64zm-256 0c61.9 0 112-50.1 112-112S381.9 32 320 32S208 82.1 208 144s50.1 112 112 112zm76.8 32h-8.3c-20.8 10-43.9 16-68.5 16s-47.6-6-68.5-16h-8.3C179.6 288 128 339.6 128 403.2V432c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48v-28.8c0-63.6-51.6-115.2-115.2-115.2zm-223.7-13.4C161.5 263.1 145.6 256 128 256H64c-35.3 0-64 28.7-64 64v32c0 17.7 14.3 32 32 32h65.9c6.3-47.4 34.8-87.3 75.2-109.4z" />
    </svg>
  );
}

/**
 * Ícone de lixeira (excluir), em SVG — mesma razão dos demais ícones deste
 * arquivo: o emoji 🗑️ depende da fonte de emoji do sistema/navegador pra
 * ficar colorido e legível; em muitos ambientes ele cai pra uma variante
 * monocromática quase invisível (foi exatamente o bug relatado: o botão de
 * excluir notificação "sumia", branco sobre branco). SVG com currentColor
 * garante a mesma aparência em qualquer navegador/SO.
 */
export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 448 512" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z" />
    </svg>
  );
}
