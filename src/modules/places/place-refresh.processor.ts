import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PLACE_REFRESH_QUEUE, PlacesService } from './places.service';

export interface PlaceRefreshJobData {
    placeId: string;
    googlePlaceId: string;
}

@Processor(PLACE_REFRESH_QUEUE)
export class PlaceRefreshProcessor extends WorkerHost {
    private readonly logger = new Logger(PlaceRefreshProcessor.name);

    constructor(private readonly placesService: PlacesService) {
        super();
    }

    async process(job: Job<PlaceRefreshJobData>): Promise<void> {
        this.logger.log(
            `Processing 30-day lazy refresh for place=${job.data.placeId} (${job.data.googlePlaceId})`,
        );
        await this.placesService.refreshPlaceFromGoogle(job.data.placeId);
    }
}
