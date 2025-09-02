import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { BotCommand, ExtendedClient } from '../types/discord';

export const listCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('Show available commands and brief descriptions') as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as unknown as ExtendedClient;

    try {
      const commands = client.commands;
      const entries = Array.from(commands.values())
        .map((cmd) => ({ name: `/${cmd.data.name}`, desc: (cmd.data as any).description || '' }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const lines = entries.map((e) => `• ${e.name} — ${e.desc}`);

      const embed = new EmbedBuilder()
        .setTitle('Available Commands')
        .setDescription(lines.join('\n'))
        .setColor(0x430297);

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
      await interaction.reply({ content: 'Failed to list commands.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  },
};

