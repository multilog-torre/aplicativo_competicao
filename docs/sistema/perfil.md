# Perfil

## Meu Perfil (dados próprios)

`GET /profile`: pontos totais, posição no ranking geral, nível atual e próximo nível (com pontos que faltam), contagem e lista de conquistas, atividades recentes (últimas 10), data de nascimento, sexo. Editável pelo próprio usuário (`PATCH /profile`): nome, cargo, departamento, data de nascimento, sexo — toda alteração é auditada com valores antes/depois (`UPDATE_PROFILE`).

Troca de senha (`PATCH /profile/password`) exige informar a senha atual — evita que uma sessão sequestrada troque a senha sem saber a original.

## Avatar

Três modos (`avatarType`), mesmo padrão usado para o ícone de conquistas:

| Modo | Comportamento |
|---|---|
| `INITIALS` | Gerado a partir do nome no frontend — não guarda arquivo nenhum. Padrão de todo usuário novo. |
| `PRESET` | Um dos avatares pré-definidos do catálogo fixo (`GET /profile/avatar-presets`) — só um identificador de ícone, sem upload. |
| `UPLOAD` | Foto enviada pela própria pessoa (JPG/PNG). Servida só por endpoint autorizado (`GET /profile/:userId/avatar`) — o caminho de armazenamento bruto nunca é exposto. Esse endpoint funciona para **qualquer** usuário autenticado ver o avatar de qualquer colega (mesmo padrão de exposição já usado no ranking/mural). |

## O perfil visto por um colega

Ver [ranking-e-participantes.md](./ranking-e-participantes.md) para a decisão completa: o perfil de um colega (`GET /profile/:userId`) mostra hoje **exatamente os mesmos dados** que o próprio perfil — incluindo data de nascimento, idade calculada, sexo, atividades recentes e conquistas. Não existe mais uma versão "resumida" para terceiros.

## O que nunca é exposto, nem no próprio perfil

- Senha (hash nunca sai da API).
- E-mail, fora das telas administrativas de gestão de usuários.
- Caminho bruto de armazenamento do avatar — sempre resolvido para uma URL do próprio backend.
