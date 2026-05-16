import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('assistant')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Get('history')
  getHistory(@CurrentUser() user: any) {
    return this.assistantService.getHistory(user.userid);
  }

  @Post('chat')
  askQuestion(
    @CurrentUser() user: any,
    @Body('question') question: string
  ) {
    return this.assistantService.askQuestion(user.userid, question);
  }
}
