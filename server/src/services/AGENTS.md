# AGENTS.md — `server/src/services/`

Serviços de longa duração, hoje centrados no WhatsApp/Baileys.

- `whatsapp.ts` é o `WhatsappService` (singleton): mantém o mapa de sessões, carrega sessões salvas, conecta/desconecta, envia mensagens e publica eventos.
- `errors.ts` define erros de domínio do serviço (`SessionNotFoundError`, `InvalidSessionError`, `InvalidMediaError`, ...). Módulos HTTP devem traduzi-los para `AppError`.
- Não importe Hono/`Context` aqui: o serviço é chamado por módulos e tarefas de background.
- Estado em memória é por processo; ao reiniciar, sessões salvas são recarregadas de `loadStoredSessions()`.
- Use `logger` para diagnóstico; nunca logue tokens, QR code ou conteúdo de mensagens.
- Cuidado com concorrência: operações por sessão devem aguardar conexão e evitar duplicar listeners.
