"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useCadastros,
  DEFAULT_PROCEDIMENTOS,
  DEFAULT_FONTES,
  DEFAULT_TAGS,
} from "@/hooks/settings/useCadastros";
import {
  Sparkle,
  Tag,
  Funnel,
  Plus,
  Trash,
  CheckCircle,
  ArrowsClockwise,
  ListPlus,
  IdentificationCard,
  WhatsappLogo,
  Receipt,
  ListChecks,
} from "@/lib/ui/icons";

export default function CadastrosSettingsPage() {
  const { procedimentos: initialProcs, fontes: initialFontes, tags: initialTags, saveCadastros, isSaving, isLoading } = useCadastros();

  const [procedimentos, setProcedimentos] = useState<string[]>(initialProcs);
  const [fontes, setFontes] = useState<string[]>(initialFontes);
  const [tags, setTags] = useState<string[]>(initialTags);

  const [novoProc, setNovoProc] = useState("");
  const [novaFonte, setNovaFonte] = useState("");
  const [novaTag, setNovaTag] = useState("");

  const [activeTab, setActiveTab] = useState<"procedimentos" | "tags" | "fontes">("procedimentos");

  useEffect(() => {
    if (initialProcs) setProcedimentos(initialProcs);
    if (initialFontes) setFontes(initialFontes);
    if (initialTags) setTags(initialTags);
  }, [initialProcs, initialFontes, initialTags]);

  // Adicionar Procedimento
  const handleAddProc = (e: React.FormEvent) => {
    e.preventDefault();
    const nome = novoProc.trim();
    if (!nome) return;
    if (procedimentos.some((p) => p.toLowerCase() === nome.toLowerCase())) {
      setNovoProc("");
      return;
    }
    setProcedimentos([...procedimentos, nome]);
    setNovoProc("");
  };

  const handleRemoveProc = (index: number) => {
    setProcedimentos(procedimentos.filter((_, i) => i !== index));
  };

  // Adicionar Fonte
  const handleAddFonte = (e: React.FormEvent) => {
    e.preventDefault();
    const nome = novaFonte.trim();
    if (!nome) return;
    if (fontes.some((f) => f.toLowerCase() === nome.toLowerCase())) {
      setNovaFonte("");
      return;
    }
    setFontes([...fontes, nome]);
    setNovaFonte("");
  };

  const handleRemoveFonte = (index: number) => {
    setFontes(fontes.filter((_, i) => i !== index));
  };

  // Adicionar Tag
  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const nome = novaTag.trim();
    if (!nome) return;
    if (tags.some((t) => t.toLowerCase() === nome.toLowerCase())) {
      setNovaTag("");
      return;
    }
    setTags([...tags, nome]);
    setNovaTag("");
  };

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  // Restaurar Padrões
  const handleRestoreDefaults = () => {
    setProcedimentos(DEFAULT_PROCEDIMENTOS);
    setFontes(DEFAULT_FONTES);
    setTags(DEFAULT_TAGS);
  };

  // Salvar no Banco
  const handleSaveAll = async () => {
    await saveCadastros({
      procedimentos,
      fontes,
      tags,
    });
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6 max-w-5xl mx-auto w-full pb-16">
      {/* Cabeçalho */}
      <header className="flex items-center justify-between flex-wrap gap-4 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ListPlus size={24} className="text-primary" /> Procedimentos, Tags & Fontes
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Cadastre os procedimentos da clínica, as opções de tags dos cards e as fontes de captação de pacientes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRestoreDefaults}
            className="text-xs h-9 gap-1.5"
          >
            <ArrowsClockwise size={14} /> Restaurar Padrões
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSaveAll}
            disabled={isSaving || isLoading}
            className="text-xs h-9 font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <CheckCircle size={16} weight="bold" />
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </header>

      {/* Navegação por Abas */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("procedimentos")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "procedimentos"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <ListChecks size={16} /> Procedimentos Odontológicos
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-background/20 text-current">
            {procedimentos.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("tags")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "tags"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Tag size={16} /> Tags de Identificação
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-background/20 text-current">
            {tags.length}
          </Badge>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("fontes")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "fontes"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Funnel size={16} /> Fontes de Captação
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-background/20 text-current">
            {fontes.length}
          </Badge>
        </button>
      </div>

      {/* Conteúdo da Aba 1: Procedimentos */}
      {activeTab === "procedimentos" && (
        <Card className="p-5 border border-border/80 bg-card rounded-2xl flex flex-col gap-4 shadow-xs">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <ListChecks size={18} className="text-emerald-500" /> Catálogo de Procedimentos da Clínica
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Estes procedimentos aparecerão no preenchimento de agendamentos, orçamentos e formulários de leads.
            </p>
          </div>

          {/* Form para Adicionar */}
          <form onSubmit={handleAddProc} className="flex items-center gap-2">
            <Input
              placeholder="Digite o nome do procedimento (ex: Implante Dentário Unitário, Botox...)"
              value={novoProc}
              onChange={(e) => setNovoProc(e.target.value)}
              className="h-9 text-xs bg-background"
            />
            <Button type="submit" size="sm" className="h-9 text-xs font-bold gap-1.5 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus size={14} weight="bold" /> Adicionar Procedimento
            </Button>
          </form>

          {/* Lista de Procedimentos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
            {procedimentos.map((proc, index) => (
              <div
                key={proc}
                className="flex items-center justify-between p-2.5 rounded-xl border border-border/70 bg-muted/30 hover:bg-muted/60 transition-colors group"
              >
                <span className="text-xs font-semibold text-foreground truncate pr-2" title={proc}>
                  • {proc}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveProc(index)}
                  className="h-6 w-6 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md shrink-0 opacity-70 group-hover:opacity-100"
                  title="Remover procedimento"
                >
                  <Trash size={13} />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Conteúdo da Aba 2: Tags */}
      {activeTab === "tags" && (
        <Card className="p-5 border border-border/80 bg-card rounded-2xl flex flex-col gap-4 shadow-xs">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Tag size={18} className="text-sky-500" /> Tags de Identificação e Filtro
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Etiquetas utilizadas para categorizar e filtrar pacientes no funil Kanban e no Inbox.
            </p>
          </div>

          {/* Form para Adicionar */}
          <form onSubmit={handleAddTag} className="flex items-center gap-2">
            <Input
              placeholder="Digite o nome da tag (ex: Paciente VIP, Orçamento Alto, Urgência...)"
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              className="h-9 text-xs bg-background"
            />
            <Button type="submit" size="sm" className="h-9 text-xs font-bold gap-1.5 shrink-0 bg-sky-600 hover:bg-sky-700 text-white">
              <Plus size={14} weight="bold" /> Adicionar Tag
            </Button>
          </form>

          {/* Lista de Tags */}
          <div className="flex flex-wrap gap-2 pt-2">
            {tags.map((tag, index) => (
              <div
                key={tag}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-bold shadow-xs group"
              >
                <span>🏷️ {tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(index)}
                  className="hover:bg-sky-500/20 rounded-full p-0.5 text-muted-foreground hover:text-red-500 transition-colors"
                  title="Remover tag"
                >
                  <Trash size={12} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Conteúdo da Aba 3: Fontes */}
      {activeTab === "fontes" && (
        <Card className="p-5 border border-border/80 bg-card rounded-2xl flex flex-col gap-4 shadow-xs">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Funnel size={18} className="text-purple-500" /> Fontes e Origens de Captação
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Canais por onde os leads chegam à clínica para rastrear o ROI de marketing e atendimento.
            </p>
          </div>

          {/* Form para Adicionar */}
          <form onSubmit={handleAddFonte} className="flex items-center gap-2">
            <Input
              placeholder="Digite o nome da fonte (ex: WhatsApp, Google Ads, Indicação...)"
              value={novaFonte}
              onChange={(e) => setNovaFonte(e.target.value)}
              className="h-9 text-xs bg-background"
            />
            <Button type="submit" size="sm" className="h-9 text-xs font-bold gap-1.5 shrink-0 bg-purple-600 hover:bg-purple-700 text-white">
              <Plus size={14} weight="bold" /> Adicionar Fonte
            </Button>
          </form>

          {/* Lista de Fontes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2">
            {fontes.map((fonte, index) => (
              <div
                key={fonte}
                className="flex items-center justify-between p-2.5 rounded-xl border border-border/70 bg-muted/30 hover:bg-muted/60 transition-colors group"
              >
                <span className="text-xs font-semibold text-foreground truncate pr-2" title={fonte}>
                  📍 {fonte}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveFonte(index)}
                  className="h-6 w-6 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md shrink-0 opacity-70 group-hover:opacity-100"
                  title="Remover fonte"
                >
                  <Trash size={13} />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
