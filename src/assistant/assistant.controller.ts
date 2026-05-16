import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
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
