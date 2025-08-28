import { Request, Response } from 'express';
import { runHeadCoach } from '../agents/headCoach';

interface ChatRequest {
  message: string;
  leagueId: string;
  userId?: string;
  currentPage?: string;
  conversationId?: string;
}

/**
 * Handle conversational chat with the HeadCoach agent
 * POST /api/chat
 */
export async function handleChat(req: Request, res: Response) {
  try {
    const { message, leagueId, userId = 'dev', currentPage = 'Dashboard', conversationId } = req.body as ChatRequest;

    // Validate required fields
    if (!message?.trim()) {
      return res.status(400).json({ 
        error: 'Message is required',
        success: false 
      });
    }

    if (!leagueId?.trim()) {
      return res.status(400).json({ 
        error: 'League ID is required',
        success: false 
      });
    }

    // Set up Server-Sent Events for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send initial connection event
    res.write(`event: connected\n`);
    res.write(`data: {"status": "connected", "message": "HeadCoach is thinking..."}\n\n`);

    try {
      // Determine the appropriate intent based on the message content and current page
      const intent = determineIntentFromMessage(message, currentPage);
      
      // Create enhanced user instruction that includes the chat context
      const enhancedMessage = buildChatUserInstruction({
        message,
        leagueId,
        userId,
        currentPage,
        intent
      });

      // Run the HeadCoach agent with conversational context
      const stream = await runHeadCoach({ 
        leagueId, 
        userId, 
        intent: 'ON_DEMAND',
        userMessage: enhancedMessage
      });

      // Stream the response back to the client
      let buffer = '';
      
      for await (const chunk of stream.textStream) {
        buffer += chunk;
        
        // Send chunks as they arrive
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify({ content: chunk, type: 'chunk' })}\n\n`);
      }
      
      // Send completion event
      res.write(`event: complete\n`);
      res.write(`data: ${JSON.stringify({ 
        content: buffer, 
        type: 'complete',
        intent,
        currentPage 
      })}\n\n`);
      
    } catch (agentError: any) {
      console.error('HeadCoach agent error:', agentError);
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ 
        error: 'Agent processing failed', 
        message: agentError?.message || 'Unknown error',
        type: 'error'
      })}\n\n`);
    }

    res.end();

  } catch (error: any) {
    console.error('Chat endpoint error:', error);
    
    // If headers haven't been sent, send JSON error
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Chat processing failed',
        message: error?.message || 'Unknown error',
        success: false
      });
    }
    
    // If streaming, send error event
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: error?.message || 'Unknown error' })}\n\n`);
    res.end();
  }
}

/**
 * Determine the appropriate HeadCoach intent based on message content and current page
 */
function determineIntentFromMessage(message: string, currentPage: string): string {
  const lowerMessage = message.toLowerCase();
  
  // Intent-specific keywords
  const lineupKeywords = ['lineup', 'start', 'sit', 'bench', 'should i start', 'who should i start'];
  const waiversKeywords = ['waiver', 'pickup', 'drop', 'add', 'wire', 'who should i pick up'];
  const reportKeywords = ['report', 'summary', 'how is my team', 'team status', 'overview'];
  
  // Check for specific intents based on message content
  if (lineupKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'LINEUP_CHECK';
  }
  
  if (waiversKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'WEEKLY_WAIVERS';
  }
  
  if (reportKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'DAILY_REPORT';
  }
  
  // Context-aware intent based on current page
  switch (currentPage) {
    case 'Roster':
      return 'LINEUP_CHECK';
    case 'Waivers':
      return 'WEEKLY_WAIVERS';
    case 'Analysis':
      return 'DAILY_REPORT';
    default:
      return 'ON_DEMAND';
  }
}

/**
 * Build enhanced user instruction that includes chat context
 */
function buildChatUserInstruction({ message, leagueId, userId, currentPage, intent }: {
  message: string;
  leagueId: string; 
  userId: string;
  currentPage: string;
  intent: string;
}): string {
  return [
    `User is chatting from the ${currentPage} page and asked: "${message}"`,
    ``,
    `Please provide a conversational response that:`,
    `- Directly answers their question`,
    `- Uses the appropriate tools (scout, analyst, executor) as needed`,
    `- Provides actionable fantasy football advice`,
    `- Maintains a helpful, knowledgeable tone`,
    `- References specific players, matchups, or data when relevant`,
    ``,
    `Context: leagueId=${leagueId}; userId=${userId}; intent=${intent}`,
    ``,
    `Respond in a conversational manner while following the standard tool choreography when analysis is needed.`
  ].join('\n');
}

