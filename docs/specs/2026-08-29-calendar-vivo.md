# Calendar vivo — contrato de produto e arquitetura

Status: **CONFIRMADO para implementação** a partir do objetivo aprovado em 2026-08-29.

## Referência estudada

O Cal.com separa quatro conceitos que também são úteis neste produto: tipos de evento,
agendamentos, disponibilidade/agendas e integrações de calendário. A implementação local
adota essa separação, mas preserva os contratos do CRM (multi-tenant, RLS, auditoria,
leads, contatos, membros e MCP). Não é um fork nem uma cópia da base do Cal.com.

## Fluxos obrigatórios

1. Uma pessoa abre **Calendar** pelo sidebar, escolhe período, membro e categoria.
2. Ela cria ou edita um agendamento com horário, duração, responsável, lead/contato,
   categoria e local. A mesma mutação grava histórico visível.
3. Um agente usa as mesmas operações centrais para listar disponibilidade, criar,
   alterar e cancelar agendamentos.
4. Cada membro pode conectar sua própria conta Google por OAuth BYO. Eventos externos
   entram no Calendar e eventos internos atribuídos àquela agenda são enviados ao Google.
5. Falhas de sincronização ficam visíveis na tela e podem ser tentadas novamente.

## Modelo

- `calendar_event_types`: categorias configuráveis, duração, cor, local e buffers.
- `calendar_member_settings`: cor, fuso e agenda padrão de cada membro.
- `calendar_connections`: credencial OAuth cifrada e cursor da sincronização.
- `calendar_events`: fonte única dos agendamentos internos e espelhos externos.
- `calendar_event_history`: trilha append-only de criação, alteração, cancelamento e sync.

Todos os registros têm `organization_id`. FKs compostas ou validação no serviço impedem
que lead, contato, membro, tipo e conexão de outra organização sejam associados.

## Mapeamento Google Calendar

| Campo local | Google Calendar |
|---|---|
| `title` | `summary` |
| `description` | `description` |
| `starts_at`, `timezone` | `start.dateTime`, `start.timeZone` |
| `ends_at`, `timezone` | `end.dateTime`, `end.timeZone` |
| `location_value` | `location` |
| `status=cancelled` | evento cancelado/delete |
| `external_event_id` | `id` |
| `external_etag` | `etag` |
| `external_updated_at` | `updated` |
| `external_ical_uid` | `iCalUID` |

IDs internos, lead e responsável vão em `extendedProperties.private`; telefone e e-mail
não são enviados. Tokens de acesso e refresh nunca são devolvidos pela API ou registrados
em log e ficam cifrados no banco.

## Sincronização

- Primeiro pull: janela controlada e `singleEvents=true`.
- Pull incremental: `nextSyncToken`; resposta `410` invalida o cursor e refaz a janela.
- Continuidade: o scheduler chama `calendar-sync` em rodízio limitado, recupera eventos
  não notificados e substitui canais `watch` antes da expiração.
- Push: cria/atualiza/cancela somente eventos internos pendentes na agenda conectada.
- Eco: um evento puxado do Google não volta como criação nova; a identidade é
  `(connection_id, external_event_id)`.
- Conflito: `etag` protege update; conflito permanece `sync_status=error`, aparece na UI e
  não sobrescreve silenciosamente nenhum lado.

## Sistema vivo

- Entrada real: UI, Google pull e ferramentas MCP.
- Saída real: Calendar interno, Google push e histórico visível.
- Continuidade humano/IA: UI, REST e MCP chamam o mesmo serviço central.
- Mutação visível: `calendar_event_history` e aba Histórico.
- Anti-morte: agendamento ligado a lead é um próximo passo concreto e consultável.
- Configuração operável: conexão Google, estado, última sincronização e erro aparecem na UI.
- Retorno do loop: falha/sucesso de sync muda `sync_status` e define a próxima ação.

## Limite de prova externa

O fluxo OAuth e a sincronização são testáveis localmente com um provedor HTTP falso. A
prova contra uma conta Google real exige credenciais BYO configuradas pelo operador no
Google Cloud; segredos não devem ser enviados em conversa nem commitados.
