import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Route } from './entities/route.entity';
import { RouteStop } from './entities/route-stop.entity';
import { RouteStay } from './entities/route-stay.entity';
import { RouteQuestion } from './entities/route-question.entity';
import { Place } from '../places/entities/place.entity';
import { UsersModule } from '../users/users.module';
import { PlacesModule } from '../places/places.module';
import { GamificationModule } from '../gamification/gamification.module';
import { MediaModule } from '../media/media.module';
import { RoutesService } from './routes.service';
import { RoutesController } from './routes.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Route,
            RouteStop,
            RouteStay,
            RouteQuestion,
            Place,
        ]),
        UsersModule,
        PlacesModule,
        GamificationModule,
        MediaModule,
    ],
    controllers: [RoutesController],
    providers: [RoutesService],
    exports: [RoutesService, TypeOrmModule],
})
export class RoutesModule {}
