import { Client, SlashCommandBuilder, ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';

export interface BotCommand {
  data: SlashCommandBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface BotButton {
  customId: string;
  execute(interaction: ButtonInteraction): Promise<void>;
}

export interface ExtendedClient extends Client {
  commands: Map<string, BotCommand>;
  buttons: Map<string, BotButton>;
}

export interface DiscordUserMapping {
  discordId: string;
  discordUsername: string;
  yahooUserId?: string | null;
  isAuthenticated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrchestratorResponse {
  success: boolean;
  data?: any;
  error?: string;
  stream?: boolean;
}

export interface FantasyReportData {
  summary: string[];
  lineup: Array<{
    action: string;
    player: string;
    reason: string;
    confidence: number;
  }>;
  waivers: Array<{
    action: string;
    player: string;
    fab: number;
    confidence: number;
  }>;
  notes: string[];
}