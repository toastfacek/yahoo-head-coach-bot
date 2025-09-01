import { 
  ChatInputCommandInteraction, 
  ButtonInteraction, 
  User, 
  Guild,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  MessageFlags
} from 'discord.js';
import { vi } from 'vitest';

export const createMockUser = (overrides: Partial<User> = {}): Partial<User> => ({
  id: '123456789012345678',
  username: 'testuser',
  discriminator: '0001',
  avatar: null,
  bot: false,
  system: false,
  mfaEnabled: false,
  verified: true,
  email: null,
  flags: null,
  premiumType: null,
  publicFlags: null,
  ...overrides,
});

export const createMockGuild = (overrides: Partial<Guild> = {}): Partial<Guild> => ({
  id: '1389354437864063037',
  name: 'Test Guild',
  icon: null,
  splash: null,
  discoverySplash: null,
  owner: true,
  ownerId: '123456789012345678',
  ...overrides,
});

export const createMockChatInputCommandInteraction = (
  overrides: Partial<ChatInputCommandInteraction> = {}
): Partial<ChatInputCommandInteraction> => {
  const mockInteraction = {
    id: '1411531332676223159',
    applicationId: '1410397095801913458',
    type: 2, // ChatInputCommand
    commandName: 'auth',
    user: createMockUser(),
    guild: createMockGuild(),
    guildId: '1389354437864063037',
    channelId: '1389354437864063038',
    replied: false,
    deferred: false,
    ephemeral: false,
    
    // Mock methods with state simulation
    reply: vi.fn().mockImplementation(async () => {
      mockInteraction.replied = true;
      return undefined;
    }),
    deferReply: vi.fn().mockImplementation(async () => {
      mockInteraction.deferred = true;
      return undefined;
    }),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    
    // Mock options handling
    options: {
      getSubcommand: vi.fn().mockReturnValue('login'),
      getString: vi.fn(),
      getInteger: vi.fn(),
      getBoolean: vi.fn(),
      getUser: vi.fn(),
      getChannel: vi.fn(),
      getRole: vi.fn(),
      getMentionable: vi.fn(),
      getNumber: vi.fn(),
      getAttachment: vi.fn(),
    },
    
    ...overrides,
  };

  return mockInteraction;
};

export const createMockButtonInteraction = (
  customId: string,
  overrides: Partial<ButtonInteraction> = {}
): Partial<ButtonInteraction> => {
  const mockInteraction = {
    id: '1411531332676223160',
    applicationId: '1410397095801913458',
    type: 3, // MessageComponent
    customId,
    componentType: 2, // Button
    user: createMockUser(),
    guild: createMockGuild(),
    guildId: '1389354437864063037',
    channelId: '1389354437864063038',
    replied: false,
    deferred: false,
    
    // Mock methods
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    
    ...overrides,
  };

  return mockInteraction;
};

// Mock Discord API errors
export const createDiscordAPIError = (code: number, message: string) => {
  const error = new Error(message);
  Object.assign(error, {
    code,
    status: code === 40060 ? 400 : code === 10062 ? 404 : 500,
    method: 'POST',
    url: 'https://discord.com/api/v10/interactions/test/callback',
    rawError: { message, code },
    requestBody: { json: { type: 4, data: { content: 'test' } } },
  });
  return error;
};

export const DISCORD_ERRORS = {
  ALREADY_ACKNOWLEDGED: () => createDiscordAPIError(40060, 'Interaction has already been acknowledged.'),
  UNKNOWN_INTERACTION: () => createDiscordAPIError(10062, 'Unknown interaction'),
  INVALID_FORM_BODY: () => createDiscordAPIError(50035, 'Invalid Form Body'),
} as const;

// Mock embed builder for testing
export const createMockEmbed = (title: string, description: string, color = 0x430297) => 
  new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color);

// Mock button components
export const createMockAuthButtons = () => 
  new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Authorize with Yahoo')
        .setStyle(5) // Link
        .setURL('https://example.com/auth'),
      new ButtonBuilder()
        .setCustomId('auth:status')
        .setLabel('Check Status')
        .setStyle(2) // Secondary
    );