# Segurança

## Como relatar uma vulnerabilidade

Não abra uma issue pública para relatar uma vulnerabilidade ainda não corrigida, nem inclua credenciais, dados de clientes ou sessões reais em exemplos.

Se o repositório tiver o recurso de relato privado de vulnerabilidades habilitado no GitHub, use **Security → Report a vulnerability** no [repositório Zappaz Lite](https://github.com/viiniolliveira/zappaz-lite/security). Caso contrário, solicite aos mantenedores um canal privado, sem publicar os detalhes da vulnerabilidade. Não há prazo de resposta ou suporte garantido.

Inclua uma descrição do problema, versão ou commit afetado, impacto, passos para reprodução e, se possível, um exemplo com dados sintéticos. Aguarde uma resposta dos mantenedores para combinar a divulgação.

## Operação segura

Use HTTPS, segredos únicos e senhas fortes; mantenha a aplicação e suas dependências atualizadas, proteja backups e restrinja o acesso ao banco e às mídias. Consulte os guias de [deploy](docs/deployment.md) e [ambiente](docs/environment.md).

O download de mídia recebida usa o transporte oficial do Baileys. A validação de destino existente não impede todos os casos de DNS rebinding ou redirecionamento, e o limite de tamanho é verificado após o arquivo ser acumulado. Considere essas limitações e faça uma avaliação de segurança antes da exposição em produção.
