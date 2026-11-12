import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
    appConfig,
    databaseConfig,
    firebaseConfig,
    googlePlacesConfig,
    quotasConfig,
    r2Config,
    redisConfig,
} from './config';
import { DatabaseInitService } from './config/database-init.service';
import { FirebaseAuthGuard } from './common/guards/firebase-auth.guard';
import { SubscriptionTierGuard } from './common/guards/subscription-tier.guard';
import { UsersModule } from './modules/users/users.module';
import { PlacesModule } from './modules/places/places.module';
import { RoutesModule } from './modules/routes/routes.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { MediaModule } from './modules/media/media.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true, // Bu parametre aşağıda tanımı yapılan tüm config'lerin tüm modüllerde global olarak tanınmasını sağlar
            load: [
                appConfig,
                databaseConfig,
                redisConfig,
                firebaseConfig,
                googlePlacesConfig,
                r2Config,
                quotasConfig,
            ],
        }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                host: configService.get<string>('database.host', 'localhost'),
                port: configService.get<number>('database.port', 5432),
                username: configService.get<string>(
                    'database.username',
                    'beenhere',
                ),
                password: configService.get<string>(
                    'database.password',
                    'beenhere_secret',
                ),
                database: configService.get<string>(
                    'database.database',
                    'been_here_db',
                ),
                autoLoadEntities: true,
                synchronize: configService.get<boolean>(
                    'database.synchronize',
                    true,
                ),
                logging: configService.get<boolean>('database.logging', false),
            }),
        }),
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                connection: {
                    host: configService.get<string>('redis.host', 'localhost'),
                    port: configService.get<number>('redis.port', 6379),
                    password:
                        configService.get<string>('redis.password') ||
                        undefined,
                    maxRetriesPerRequest: null,
                    lazyConnect: true,
                },
            }),
        }),
        UsersModule,
        PlacesModule,
        RoutesModule,
        GamificationModule,
        MediaModule,
    ],
    controllers: [AppController],
    providers: [
        AppService,
        DatabaseInitService,
        {
            provide: APP_GUARD,
            useClass: FirebaseAuthGuard,
        },
        {
            provide: APP_GUARD,
            useClass: SubscriptionTierGuard,
        },
    ],
})
export class AppModule {}
