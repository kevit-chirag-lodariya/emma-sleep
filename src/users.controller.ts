import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('sync')
  syncUsers(
    @Query('includeUsers') includeUsers?: string,
    @Query('maxWindows') maxWindows?: string,
    @Query('maxUsers') maxUsers?: string,
  ): Promise<Record<string, unknown>> {
    const parsedMaxWindows = maxWindows ? Number(maxWindows) : undefined;
    const parsedMaxUsers = maxUsers ? Number(maxUsers) : undefined;
    const parsedIncludeUsers =
      includeUsers === undefined ? undefined : includeUsers === 'true';

    return this.usersService.syncUsersFromDateRange({
      includeUsers: parsedIncludeUsers,
      maxWindows: Number.isFinite(parsedMaxWindows)
        ? parsedMaxWindows
        : undefined,
      maxUsers: Number.isFinite(parsedMaxUsers) ? parsedMaxUsers : undefined,
    });
  }

  @Get('sync-store')
  syncAndStore(): Promise<Record<string, unknown>> {
    return this.usersService.syncAndStoreUsers();
  }

  @Get('sync-messages')
  syncMessages(): Promise<Record<string, unknown>> {
    return this.usersService.syncAndStoreMessages();
  }
}
