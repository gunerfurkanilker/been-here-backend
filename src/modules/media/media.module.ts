import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Route } from '../routes/entities/route.entity';
import { RouteStop } from '../routes/entities/route-stop.entity';
import { UsersModule } from '../users/users.module';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Route, RouteStop]), UsersModule],
    controllers: [MediaController],
    providers: [MediaService],
    exports: [MediaService],
})
export class MediaModule {}
