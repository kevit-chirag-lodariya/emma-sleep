import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database.service';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { CustomersController } from './customers.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AdvancedAnalyticsService } from './advanced-analytics.service';
import { AdvancedAnalyticsController } from './advanced-analytics.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: Message.name, schema: MessageSchema },
    ]),
  ],
  controllers: [
    AppController,
    UsersController,
    CustomersController,
    AnalyticsController,
    AdvancedAnalyticsController,
  ],
  providers: [AppService, UsersService, DatabaseService, AnalyticsService, AdvancedAnalyticsService],
})
export class AppModule {}
