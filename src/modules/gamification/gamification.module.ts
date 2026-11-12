import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Place } from '../places/entities/place.entity';
import { Route } from '../routes/entities/route.entity';
import { RouteStop } from '../routes/entities/route-stop.entity';
import { UserRegionalScore } from './entities/user-regional-score.entity';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            Place,
            Route,
            RouteStop,
            UserRegionalScore,
        ]),
    ],
    controllers: [GamificationController],
    providers: [GamificationService],
    exports: [GamificationService, TypeOrmModule],
})
export class GamificationModule {}
