import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Place } from './entities/place.entity';
import { PlaceList } from './entities/place-list.entity';
import { PlaceListItem } from './entities/place-list-item.entity';
import { Route } from '../routes/entities/route.entity';
import { RouteStop } from '../routes/entities/route-stop.entity';
import { UsersModule } from '../users/users.module';
import { PlacesService, PLACE_REFRESH_QUEUE } from './places.service';
import { PlacesController } from './places.controller';
import { PlaceRefreshProcessor } from './place-refresh.processor';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Place,
            PlaceList,
            PlaceListItem,
            Route,
            RouteStop,
        ]),
        BullModule.registerQueue({
            name: PLACE_REFRESH_QUEUE,
        }),
        UsersModule,
    ],
    controllers: [PlacesController],
    providers: [PlacesService, PlaceRefreshProcessor],
    exports: [PlacesService, TypeOrmModule],
})
export class PlacesModule {}
