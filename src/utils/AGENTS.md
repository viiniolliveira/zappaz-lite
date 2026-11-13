# AGENTS.md — `src/utils/`

Utilitários isolados do frontend que não pertencem à camada de API.

## Como trabalhar

- Funções puras e tipadas, sem React, sem estado global e sem chamadas de rede.
- Envie as senhas pelo contrato HTTPS da API, como no login; não aplique hash adicional no frontend. O backend valida a senha atual e armazena a nova com bcrypt.
- Nada de segredos, salt fixo ou hash de senha persistido aqui; o hash de senha real é feito no backend com bcrypt.
- Se o helper for de data/formatação, prefira `src/lib/utils/`.
