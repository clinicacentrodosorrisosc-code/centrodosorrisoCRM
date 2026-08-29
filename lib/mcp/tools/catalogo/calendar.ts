import { declararTools } from "./tipos";

export const TOOLS_CALENDAR = declararTools([
  { name: "crm_calendar_list_events", category: "read", rotulo: "Ver agendamentos", explicacao: "Mostra os compromissos da equipe em um período, com responsável, lead e categoria quando existirem.", oQueToca: "Calendar da equipe", risco: "seguro", pacotes: ["organizar", "reter"] },
  { name: "crm_calendar_check_availability", category: "read", rotulo: "Conferir um horário livre", explicacao: "Confere se uma pessoa já tem outro compromisso no horário proposto antes de marcar algo novo.", oQueToca: "Disponibilidade da equipe", risco: "seguro", pacotes: ["organizar"] },
  { name: "crm_calendar_list_categories", category: "read", rotulo: "Ver categorias de agendamento", explicacao: "Mostra os tipos de compromisso configurados, incluindo duração e formato esperados pela empresa.", oQueToca: "Categorias do Calendar", risco: "seguro", pacotes: ["organizar"] },
  { name: "crm_calendar_create_event", category: "write", rotulo: "Criar um agendamento", explicacao: "Marca um compromisso real na agenda de uma pessoa e liga o horário ao lead ou contato informado.", oQueToca: "Calendar da equipe", risco: "atencao", pacotes: ["organizar", "reter"] },
  { name: "crm_calendar_update_event", category: "write", rotulo: "Alterar um agendamento", explicacao: "Muda horário, responsável, categoria ou detalhes de um compromisso e deixa a alteração visível no histórico.", oQueToca: "Calendar da equipe", risco: "atencao", pacotes: ["organizar", "reter"] },
  { name: "crm_calendar_cancel_event", category: "write", rotulo: "Cancelar um agendamento", explicacao: "Desmarca um compromisso sem apagar o que aconteceu e registra o motivo para a equipe acompanhar.", oQueToca: "Calendar da equipe", risco: "atencao", pacotes: ["organizar", "reter"] },
]);
