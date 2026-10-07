# Como as peças se integram — Vercel, Render, Neon e Cloudinary

Este documento explica, de forma didática e passo a passo, como os 4 serviços externos da Torre conversam entre si pra fazer o sistema funcionar de ponta a ponta. Complementa o [DEPLOY.md](./DEPLOY.md) (que foca em configuração/variáveis de ambiente/manutenção de cada serviço) — aqui o foco é **o fluxo**: o que acontece, em que ordem, quando alguém usa o app.

---

## 1. As quatro peças e o papel de cada uma

A Torre não é "um programa" — são 4 serviços independentes, cada um especialista em UMA coisa, conversando entre si:

```text
Navegador do usuário
       │
       ▼
┌─────────────┐     HTTP (API)     ┌─────────────┐
│   VERCEL    │ ─────────────────▶ │   RENDER    │
│  (site/HTML)│ ◀───────────────── │ (backend/API)│
└─────────────┘                    └──────┬──────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        ▼                                      ▼
                 ┌─────────────┐                        ┌─────────────┐
                 │    NEON     │                        │ CLOUDINARY  │
                 │ (banco SQL) │                        │ (arquivos)  │
                 └─────────────┘                        └─────────────┘
```

- **Vercel** entrega o **site** (o React compilado em HTML/CSS/JS) — é só uma vitrine estática, rápida, sem lógica de negócio.
- **Render** roda o **backend** — o código Node.js que decide regras, calcula pontos, valida login. É o "cérebro".
- **Neon** guarda os **dados permanentes** — cada usuário, atividade, ponto, notificação vira uma linha numa tabela aqui.
- **Cloudinary** guarda **arquivos** (fotos de evidência, avatares, fotos do mural) — nunca ficam no banco nem no Render.

Por que separado assim? Porque Render (o servidor) **não tem disco permanente** no plano gratuito — qualquer arquivo salvo ali some no próximo deploy ou reinício. Por isso fotos vão pro Cloudinary (especialista em arquivo) e dados estruturados vão pro Neon (especialista em banco).

---

## 2. Como o código chega a ficar "no ar" (deploy)

1. Alguém edita código localmente e dá `git push` pro GitHub.
2. **Vercel** e **Render** ficam "escutando" esse repositório. Os dois recebem um aviso automático de que algo mudou.
3. **Vercel**: baixa a pasta `frontend/`, roda `vite build` (transforma `.tsx` em arquivos estáticos otimizados), e publica isso na CDN dele. Leva uns 30-60s. Resultado: a URL pública do site passa a servir a versão nova.
4. **Render**: baixa a pasta `backend/`, roda `npm install` + `npm run build` (compila TypeScript → JavaScript), aplica migrations no banco se o schema mudou (`prisma migrate deploy`), e reinicia o processo Node.js com o código novo. Leva de 2 a 5 minutos.

Os dois são **independentes** — um push pode atualizar só o frontend, só o backend, ou os dois, dependendo do que mudou.

---

## 3. O que acontece quando alguém abre o site (fluxo normal)

1. Navegador acessa a URL do Vercel → recebe o HTML/JS/CSS já prontos (nenhuma lógica roda aqui, é tipo abrir um PDF).
2. O JavaScript que chegou começa a rodar NO NAVEGADOR da pessoa, e faz chamadas HTTP pra URL do Render (guardada na variável `VITE_API_URL`) — por exemplo, `POST /auth/login`.
3. O **Render** recebe essa chamada, executa a lógica (confere senha, gera token), e no meio do caminho ele mesmo faz outra chamada — pro **Neon** — pra consultar/gravar no banco (`SELECT * FROM users WHERE email = ...`).
4. O Neon responde pro Render, o Render responde pro navegador, e a tela atualiza.

Ou seja: **o navegador nunca fala direto com o banco nem com o Cloudinary** — tudo passa pelo Render, que é o único que tem as credenciais e decide o que é permitido.

---

## 4. Exemplo real, passo a passo: registrar uma atividade com foto

Esse é o fluxo que amarra as 4 peças ao mesmo tempo — e foi exatamente onde um bug real de produção vivia (corrigido em outubro/2026, ver commit `c5412e5`).

**Passo 1 — Pessoa registra a atividade** (`POST /activities` no app, rodando no Vercel) → vira uma chamada HTTP pro Render → Render grava uma linha na tabela `user_activities` no **Neon**, com status `PENDING`. Responde "criado" pro navegador. Nenhum arquivo envolvido ainda.

**Passo 2 — Pessoa anexa a foto da evidência** (`POST /activities/:id/evidence`) → o navegador manda o arquivo (bytes da imagem) pro Render → o Render faz uma chamada de **upload** pro **Cloudinary** (`cloudinary.uploader.upload_stream`), que guarda a foto e devolve um identificador (`public_id`). O Render grava SÓ esse identificador no Neon (nunca a foto em si) — tabela `activity_evidences`.

**Passo 3 — Aprovação automática dispara** (mesma requisição, continuação do passo 2, se a modalidade exige evidência e a configuração de auto-aprovação está ligada): o Render precisa colocar essa foto também no post do Mural. Pra isso, ele faz uma chamada de **download** pro Cloudinary (`fetch(url)`) pra buscar os bytes da foto de volta, e então grava o post no Neon.

**O bug que vivia aqui**: esse "buscar a foto de volta" (passo 3) é uma chamada de rede pra fora (Cloudinary), e ela rodava **dentro** de uma transação de banco que tem um limite padrão de 5 segundos (`prisma.$transaction`). Quando o Cloudinary demorava um pouco mais que o normal, o Prisma (a ferramenta que o Render usa pra falar com o Neon) cancelava a transação sozinho — e a aprovação inteira falhava, mesmo a foto já tendo sido salva no passo 2 (a atividade ficava travada em `PENDING`, com evidência anexada, sem nenhum erro visível no app). Corrigido buscando a foto **antes** de abrir essa transação — ela nunca mais compete com esse limite de tempo (ver [mural.md](./sistema/mural.md) e [pontuacao.md](./sistema/pontuacao.md) pros detalhes de implementação).

---

## 5. Os dois comportamentos de "hibernação" que aparecem no dia a dia

- **Render (plano grátis) hiberna depois de ~15 min sem nenhuma requisição.** A próxima pessoa que acessar espera 30-60s na primeira requisição, enquanto ele "liga" de novo. Isso aparece no log do Render como o aviso `Your free instance will spin down with inactivity, which can delay requests by 50 seconds or more`. Não perde nada, só demora uma vez.
- **Neon também "dorme"**, mas acorda bem mais rápido (quase imperceptível, menos de 1 segundo) — por isso normalmente não se sente.
- **Vercel e Cloudinary não hibernam** — ficam sempre prontos.

---

## 6. Resumo de quem fala com quem

| De | Para | Quando | O que trafega |
|---|---|---|---|
| Navegador | Vercel | Carregar a página | HTML/CSS/JS |
| Navegador | Render | Toda ação (login, registrar atividade, ver ranking...) | JSON (dados) |
| Render | Neon | Toda leitura/gravação de dado estruturado | SQL |
| Render | Cloudinary | Upload/download de foto/arquivo | Bytes do arquivo |

Pra detalhes de configuração (variáveis de ambiente, limites de cada plano gratuito, como recriar o seed), ver [DEPLOY.md](./DEPLOY.md).
