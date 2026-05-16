import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Groq from 'groq-sdk';

@Injectable()
export class AssistantService {
  private groq: Groq;

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      console.warn('GROQ_API_KEY is not set in environment variables');
    }

    this.groq = new Groq({
      apiKey: apiKey,
    });
  }

  async getHistory(userId: string) {
    const logs = await this.prisma.aiquerylogs.findMany({
      where: { userid: userId },
      orderBy: { createdat: 'asc' },
    });

    return logs.map((l) => ({
      ...l,
      queryid: l.queryid.toString(),
    }));
  }

  async askQuestion(userId: string, question: string) {
    try {
      // Fetch inventory
      const products = await this.prisma.products.findMany({
        where: { isactive: true },
        include: {
          stock: true,
          categories: true,
        },
      });

      const inventoryData = products
        .map(
          (p) =>
            `- ${p.productname} | Category: ${
              p.categories?.categoryname || 'N/A'
            } | Price: ₹${p.price} | Stock: ${
              p.stock?.quantity || 0
            } | Threshold: ${p.stock?.lowstockthreshold || 5}`,
        )
        .join('\n');

      const systemPrompt = `
You are StockSense AI, an intelligent inventory management assistant.

You ONLY answer using the inventory data provided below.

Inventory Data:
${inventoryData}

Rules:
- Give concise and accurate answers.
- Use markdown formatting when needed.
- If data is unavailable, say so clearly.
- Do not hallucinate products or stock.
`;

      // Fetch previous history
      const history = await this.prisma.aiquerylogs.findMany({
        where: { userid: userId },
        orderBy: { createdat: 'desc' },
        take: 5,
      });

      const chronologicalHistory = history.reverse();

      // Create messages
      const messages: any[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...chronologicalHistory.flatMap((h) => [
          {
            role: 'user',
            content: h.userquestion,
          },
          {
            role: 'assistant',
            content: h.airesponse || '',
          },
        ]),
        {
          role: 'user',
          content: question,
        },
      ];

      // Call Groq
      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.5,
        max_tokens: 1024,
      });

      const aiResponse =
        completion.choices[0]?.message?.content ||
        'No response generated';

      // Save to DB
      const log = await this.prisma.aiquerylogs.create({
        data: {
          userid: userId,
          userquestion: question,
          airesponse: aiResponse,
        },
      });

      return {
        ...log,
        queryid: log.queryid.toString(),
      };
    } catch (error) {
      console.error('Groq AI Error:', error);

      throw new InternalServerErrorException(
        'Failed to process AI request',
      );
    }
  }
}