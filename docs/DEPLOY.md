# Documento de Hospedagem e Deploy — Torre

Este documento explica, com detalhes, cada serviço externo usado para colocar a Torre no ar, o que cada um faz especificamente neste projeto, e o que exige (ou não) atenção contínua depois que tudo está funcionando.

---

## 1. Visão geral — as 4 peças

A aplicação está dividida em 4 serviços independentes, cada um numa plataforma diferente, todos gratuitos:

```text
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│   VERCEL     │──────▶│    RENDER     │──────▶│     NEON      │
│  (frontend)   │  HTTP  │   (backend)   │  SQL   │ (banco de     │
│               │◀──────│               │◀──────│  dados)       │
└──────────────┘        └───────┬──────┘        └──────────────┘
                                 │
                                 │ upload/download
                                 ▼
                          ┌──────────────┐
                          │  CLOUDINARY   │
                          │  (arquivos)   │
                          └──────────────┘
```

- **Vercel** entrega o site (a interface que o navegador carrega).
- **Render** roda o backend (a API que faz login, calcula pontos, valida regras).
- **Neon** guarda os dados permanentes (usuários, atividades, pontos, tudo).
- **Cloudinary** guarda as fotos e comprovantes enviados (evidências, avatares, fotos do mural).

O **GitHub** (`multilog-torre/aplicativo_competicao`) é o ponto de partida de tudo: sempre que alguém dá `git push`, Vercel e Render detectam a mudança e publicam uma nova versão automaticamente — ninguém precisa fazer upload manual em nenhuma das duas.

---

## 2. Vercel — hospeda o site (frontend)

### O que é
Uma plataforma especializada em publicar sites feitos em React/Vite (e outros frameworks parecidos). Ela pega o código do repositório, "compila" (transforma os arquivos `.tsx` em HTML/CSS/JS que o navegador entende) e distribui esse resultado por uma rede mundial de servidores (CDN), o que faz o site carregar rápido em qualquer lugar.

### O que ela faz especificamente aqui
- Publica a pasta `frontend/` do repositório.
- A cada `git push` na branch `main`, ela reconstrói e publica a nova versão automaticamente, em menos de 1 minuto.
- Fornece a URL pública fixa do site (ex.: `https://aplicativo-competicao.vercel.app`).

### Variável de ambiente que ela guarda
| Variável | Pra que serve |
|---|---|
| `VITE_API_URL` | O endereço do backend (Render) que o site deve chamar. Se a URL do Render mudar um dia, é aqui que se atualiza. |

### Precisa de manutenção?
**Não.** O plano gratuito do Vercel não hiberna, não expira e não tem limite de tempo — o site fica sempre acessível instantaneamente, sem "acordar". A única ação manual necessária é se você mudar `VITE_API_URL` depois do primeiro deploy: nesse caso, é preciso ir em **Deployments → Redeploy**, porque essa variável só é aplicada no momento da compilação, não em tempo real.

---

## 3. Render — hospeda o backend (a API)

### O que é
Uma plataforma que mantém um servidor Node.js rodando continuamente (diferente do Vercel, que só entrega arquivos estáticos — o Render executa código de verdade, o tempo todo, escutando requisições).

### O que ele faz especificamente aqui
Toda vez que alguém dá `git push`, o Render:
1. Baixa o código da pasta `backend/`.
2. Roda `npm install` e compila o TypeScript (`npm run build`).
3. Aplica as migrations do banco (`prisma migrate deploy`) — cria/ajusta tabelas no Neon, se houver mudança de schema.
4. Inicia o servidor (`npm start`), que fica escutando requisições da API (login, pontos, atividades, tudo).

Esse fluxo de build+deploy está definido no arquivo `render.yaml`, na raiz do repositório — é ele que o Render lê pra saber o que fazer, sem precisar configurar nada manualmente a cada deploy.

### Variáveis de ambiente que ele guarda
| Variável | Pra que serve |
|---|---|
| `DATABASE_URL` | Endereço de conexão com o banco no Neon |
| `JWT_SECRET` / `REFRESH_TOKEN_SECRET` | Chaves usadas para gerar os tokens de login — se alguém tivesse acesso a elas, poderia forjar um login válido. Nunca compartilhar. |
| `FRONTEND_URL` | A URL do Vercel — usada para liberar o CORS (só aceita requisições vindas dessa origem específica) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Credenciais pra falar com o Cloudinary |
| `STORAGE_PROVIDER=cloudinary` | Diz ao backend pra usar o Cloudinary em vez de salvar arquivo em disco |
| `NODE_ENV`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`, `MAX_UPLOAD_SIZE_MB` | Configurações gerais de comportamento |

### Precisa de manutenção?

**Sim, um ponto de atenção real**: o plano gratuito do Render **hiberna o serviço depois de ~15 minutos sem receber nenhuma requisição**. Isso não é uma falha — é o modelo do plano grátis pra economizar recursos. O efeito prático:

- Se ninguém acessar o site por um tempo e alguém entrar depois, a **primeira** requisição demora de 30 a 60 segundos (o Render está "acordando" o servidor). As próximas ficam rápidas normalmente, até hibernar de novo por inatividade.
- Isso é só uma questão de tempo de resposta — nenhum dado é perdido, nada quebra, é só uma espera na primeira vez.

Se isso for um problema real no dia a dia (por exemplo, muita gente reclamando da demora), a solução é migrar esse serviço específico pro plano pago do Render (a partir de ~US$7/mês), que não hiberna nunca.

Fora isso, **não precisa reiniciar nada manualmente** — ele já reinicia sozinho a cada deploy, e continua no ar indefinidamente entre deploys.

---

## 4. Neon — guarda o banco de dados (PostgreSQL)

### O que é
Um provedor de banco de dados PostgreSQL "na nuvem" — ele cuida de manter o banco funcionando, seguro e com backups, sem que a gente precise instalar ou administrar um servidor de banco de dados.

### O que ele faz especificamente aqui
Guarda literalmente todos os dados permanentes da aplicação: usuários, senhas (criptografadas), departamentos, modalidades, atividades registradas, pontos, ranking, conquistas, desafios, premiações, publicações do mural, notificações e auditoria. **Tudo o que os usuários fazem no site vira uma linha nesse banco.**

O Render se conecta a ele usando a variável `DATABASE_URL`.

### Precisa de manutenção?
**Pouca, mas vale ficar de olho em dois limites do plano gratuito:**

1. **Suspensão do "compute" por inatividade**: o Neon pausa o processamento do banco depois de alguns minutos sem uso (parecido com o Render, mas mais rápido de "acordar" — geralmente menos de 1 segundo, quase imperceptível). Não é preciso fazer nada, ele acorda automaticamente na próxima consulta.
2. **Limite de armazenamento**: o plano gratuito tem um teto de espaço (na ordem de ~0,5 GB). Como os arquivos (fotos/comprovantes) ficam no Cloudinary, não no Neon, esse limite demora bastante pra ser atingido só com texto/números — mas se o uso crescer muito (milhares de atividades/transações), vale checar o painel do Neon de vez em quando (**Dashboard → Usage**).

Não é preciso "ativar" nada — ele fica disponível o tempo todo, só demora um instante pra acordar quando ninguém usou por um tempo.

---

## 5. Cloudinary — guarda fotos e comprovantes

### O que é
Um serviço especializado em armazenar e entregar imagens/arquivos (com CDN própria, redimensionamento automático, etc.) — muito usado exatamente para o problema que ele resolve aqui: guardar arquivos de forma permanente quando o servidor da aplicação (Render) não tem um "disco" que sobrevive entre reinicializações.

### O que ele faz especificamente aqui
Toda vez que alguém:
- Envia uma **evidência** de atividade (foto/PDF/comprovante),
- Faz **upload de avatar** (foto de perfil),
- Publica uma **foto no mural**,

o backend manda esse arquivo pro Cloudinary guardar, e salva no banco (Neon) só uma referência pra ele — nunca a foto em si. Quando alguém pede pra ver esse arquivo, o backend busca de volta no Cloudinary e entrega, sempre verificando antes se a pessoa tem permissão (o arquivo nunca fica público direto por link).

### Precisa de manutenção?
**Não**, para o uso normal. Só vale prestar atenção nos limites do plano gratuito (visíveis no **Dashboard** do Cloudinary): uma cota mensal de "créditos" que cobre armazenamento + transformações + tráfego. Pra um uso interno de equipe, essa cota costuma ser suficiente por bastante tempo. Se um dia aparecer um aviso de limite atingido no painel, é hora de considerar o plano pago (bem barato) ou revisar o volume de uploads.

---

## 6. Resumo — o que exige atenção e o que não exige

| Situação | Precisa fazer algo? |
|---|---|
| Uso normal do dia a dia (ninguém mexe em código/configuração) | **Não.** Tudo roda sozinho. |
| Alguém acessa o site depois de tempo ocioso | Não precisa fazer nada — só esperar ~30-60s na primeira requisição (Render "acordando") |
| Alguém dá `git push` com uma mudança de código | Nada manual — Vercel e Render redeployam sozinhos |
| Mudou uma variável de ambiente no Vercel (`VITE_API_URL`) | Precisa clicar em **Redeploy** manualmente |
| Mudou uma variável de ambiente no Render | Ele já reconstrói e reinicia sozinho ao salvar (se usar "Save, rebuild, and deploy") |
| Quer reaproveitar/recriar o banco do zero | Precisa rodar o seed manualmente uma vez (ver seção 7) |
| Aviso de limite atingido em algum painel (Render/Neon/Cloudinary) | Avaliar upgrade pro plano pago daquele serviço específico, ou reduzir uso |

---

## 7. Recriando os dados de teste (seed), se precisar um dia

O banco já está populado com os usuários e dados de demonstração. Se um dia for preciso recriar isso do zero (ex.: um banco novo, ou quer resetar tudo para o estado inicial), o comando que popula tudo é:

```bash
npx prisma migrate deploy --schema=prisma/schema.prisma
npx tsx prisma/seed.ts
```

No Render, isso pode ser rodado temporariamente adicionando `&& npx tsx prisma/seed.ts` de volta no **Start Command** (aba **Settings** do serviço), fazendo um deploy, e depois removendo de novo — ou usando a opção **Manual Job** do Render (se disponível no seu plano) para rodar esse comando uma única vez sem afetar o serviço principal.

⚠️ O seed é seguro de rodar de novo (não duplica usuários), mas **reseta** qualquer edição manual feita em Modalidades, Níveis, Conquistas ou Regras do Jogo de volta aos valores originais — usuários, pontos e histórico nunca são afetados.

---

## 8. Onde cada coisa foi configurada (referência rápida)

| Arquivo no repositório | O que configura |
|---|---|
| `render.yaml` | Como o Render builda e inicia o backend |
| `frontend/vercel.json` | Garante que rotas internas do site (ex.: `/painel`, `/admin/usuarios`) funcionem ao atualizar a página, não só navegando pelo menu |
| `backend/.env.example` | Lista de todas as variáveis de ambiente que o backend aceita, documentadas |
| `frontend/.env.example` | Idem, para o frontend |
| `backend/src/modules/storage/cloudinary-storage.provider.ts` | Código que fala com o Cloudinary |

Nenhum desses arquivos contém senhas ou chaves reais — os valores verdadeiros ficam só nos painéis do Vercel e do Render (variáveis de ambiente), nunca no código.
