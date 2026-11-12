import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { Route } from '../routes/entities/route.entity';
import { RouteStop } from '../routes/entities/route-stop.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import {
    AttachStopMediaDto,
    RemoveStopMediaDto,
    RequestPresignedUrlDto,
} from './dto/media.dto';

@Injectable()
export class MediaService {
    private s3Client: S3Client | null = null;

    constructor(
        private readonly configService: ConfigService,
        private readonly usersService: UsersService,
        @InjectRepository(Route)
        private readonly routeRepo: Repository<Route>,
        @InjectRepository(RouteStop)
        private readonly stopRepo: Repository<RouteStop>,
    ) {
        this.initR2Client();
    }

    private initR2Client(): void {
        const accountId = this.configService.get<string>('r2.accountId');
        const accessKeyId = this.configService.get<string>('r2.accessKeyId');
        const secretAccessKey =
            this.configService.get<string>('r2.secretAccessKey');

        if (accountId && accessKeyId && secretAccessKey) {
            this.s3Client = new S3Client({
                region: 'auto',
                endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
            });
        }
    }

    /**
     * TRD 4.3: Cloudflare R2 Presigned URL üretimi ve Free/Premium medya kotası denetimi
     */
    async createPresignedUploadUrl(user: User, dto: RequestPresignedUrlDto) {
        const isPremium = this.usersService.isPremiumActive(user);
        const requestedCount = dto.requested_count ?? 1;

        // 1. MIME Type Kontrolü (Free üye sadece image/webp ve image/jpeg yükleyebilir, video engellenir)
        if (!isPremium) {
            if (dto.mime_type.startsWith('video/')) {
                throw new ForbiddenException(
                    'Ücretsiz üyelikte video yüklenemez. Kısa video yükleme özelliği sadece Premium üyelere açıktır (Upgrade to Premium).',
                );
            }

            if (
                dto.mime_type !== 'image/webp' &&
                dto.mime_type !== 'image/jpeg'
            ) {
                throw new ForbiddenException(
                    'Ücretsiz üyelikte yalnızca image/webp veya image/jpeg formatında fotoğraf yüklenebilir.',
                );
            }
        }

        // 2. Durak Başına Fotoğraf ve Rota Başına Durak Kotası Kontrolü (Free: rota başı max 20 durak, durak başı max 3 foto -> doğal max 60 foto)
        if (!isPremium && dto.target_type === 'ROUTE_STOP') {
            const maxPerStop = this.configService.get<number>(
                'quotas.freeMaxPhotosPerStop',
                3,
            );
            const maxStopsPerRoute = this.configService.get<number>(
                'quotas.freeMaxStopsPerRoute',
                20,
            );
            const maxPerRoute = maxStopsPerRoute * maxPerStop;

            if (requestedCount > maxPerStop) {
                throw new ForbiddenException(
                    `Ücretsiz üyelikte durak başına en fazla ${maxPerStop} fotoğraf yükleyebilirsiniz (Upgrade to Premium).`,
                );
            }

            if (dto.stop_id) {
                const stop = await this.stopRepo.findOne({
                    where: { id: dto.stop_id },
                });
                if (!stop) {
                    throw new NotFoundException('Rota durağı bulunamadı.');
                }
                const currentStopMediaCount = stop.media_urls?.length ?? 0;
                if (currentStopMediaCount + requestedCount > maxPerStop) {
                    throw new ForbiddenException(
                        `Ücretsiz üyelikte durak başına en fazla ${maxPerStop} fotoğraf hakkınız bulunmaktadır (Upgrade to Premium).`,
                    );
                }
            }

            if (dto.route_id) {
                const route = await this.routeRepo.findOne({
                    where: { id: dto.route_id, user_id: user.id },
                });
                if (!route) {
                    throw new NotFoundException('Rota bulunamadı.');
                }
                const stops = await this.stopRepo.find({
                    where: { route_id: dto.route_id },
                });
                const totalRouteMediaCount = stops.reduce(
                    (sum, s) => sum + (s.media_urls?.length ?? 0),
                    0,
                );
                if (totalRouteMediaCount + requestedCount > maxPerRoute) {
                    throw new ForbiddenException(
                        `Ücretsiz üyelikte bir rotada toplam en fazla ${maxPerRoute} fotoğraf (${maxStopsPerRoute} durak x ${maxPerStop} fotoğraf) yükleyebilirsiniz (Upgrade to Premium).`,
                    );
                }
            }
        }

        const bucketName = this.configService.get<string>(
            'r2.bucketName',
            'been-here-media',
        );
        const publicBaseUrl = this.configService.get<string>(
            'r2.publicBaseUrl',
            'https://media.beenhere.app',
        );
        const expiresIn = this.configService.get<number>(
            'r2.presignedUrlExpiresSeconds',
            900,
        );

        const ext = this.getExtensionFromMime(dto.mime_type);
        const folder = (dto.target_type ?? 'ROUTE_STOP').toLowerCase();
        const objectKey = `${folder}/${user.id}/${randomUUID()}.${ext}`;
        const publicUrl = `${publicBaseUrl.replace(/\/$/, '')}/${objectKey}`;

        if (this.s3Client) {
            const command = new PutObjectCommand({
                Bucket: bucketName,
                Key: objectKey,
                ContentType: dto.mime_type,
            });

            const uploadUrl = await getSignedUrl(this.s3Client, command, {
                expiresIn,
            });

            return {
                upload_url: uploadUrl,
                public_url: publicUrl,
                object_key: objectKey,
                mime_type: dto.mime_type,
                expires_in_seconds: expiresIn,
                provider: 'CLOUDFLARE_R2',
            };
        }

        // DEV_MOCK_EXTERNAL_SERVICES fallback
        return {
            upload_url: `https://mock-r2-upload.beenhere.app/${bucketName}/${objectKey}?expires=${expiresIn}`,
            public_url: publicUrl,
            object_key: objectKey,
            mime_type: dto.mime_type,
            expires_in_seconds: expiresIn,
            provider: 'MOCK_R2_DEV',
        };
    }

    /**
     * Mobil arayüzün fotoğraf seçiciyi açmadan veya rota ekranındayken anlık kota durumunu bilmesini sağlar.
     */
    async getRouteMediaQuotaStatus(user: User, routeId: string) {
        const route = await this.routeRepo.findOne({
            where: { id: routeId, user_id: user.id },
        });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }

        const isPremium = this.usersService.isPremiumActive(user);
        const maxPerStop = isPremium
            ? null
            : this.configService.get<number>('quotas.freeMaxPhotosPerStop', 3);
        const maxStopsPerRoute = isPremium
            ? null
            : this.configService.get<number>('quotas.freeMaxStopsPerRoute', 20);
        const maxPerRoute =
            maxPerStop !== null && maxStopsPerRoute !== null
                ? maxStopsPerRoute * maxPerStop
                : null;

        const stops = await this.stopRepo.find({
            where: { route_id: routeId },
            order: { order_index: 'ASC' },
        });

        const totalRoutePhotos = stops.reduce(
            (sum, s) => sum + (s.media_urls?.length ?? 0),
            0,
        );

        return {
            route_id: route.id,
            is_premium: isPremium,
            can_upload_video: isPremium,
            max_stops_per_route: maxStopsPerRoute,
            used_stops: stops.length,
            remaining_stops:
                maxStopsPerRoute !== null
                    ? Math.max(0, maxStopsPerRoute - stops.length)
                    : null,
            max_photos_per_stop: maxPerStop,
            max_photos_per_route: maxPerRoute,
            used_route_photos: totalRoutePhotos,
            remaining_route_photos:
                maxPerRoute !== null
                    ? Math.max(0, maxPerRoute - totalRoutePhotos)
                    : null,
            stops: stops.map((s) => {
                const count = s.media_urls?.length ?? 0;
                return {
                    stop_id: s.id,
                    place_id: s.place_id,
                    used_photos: count,
                    remaining_stop_photos:
                        maxPerStop !== null
                            ? Math.max(0, maxPerStop - count)
                            : null,
                };
            }),
        };
    }

    /**
     * Kullanıcı fotoğrafları kaydet butonuna basmadan önce, durağa fotoğraf eklediği anda
     * kota kontrolünü yapar ve durağın media_urls listesine kaydedip kalan kotayı döner.
     */
    async attachMediaToStop(
        user: User,
        routeId: string,
        stopId: string,
        dto: AttachStopMediaDto,
    ) {
        const route = await this.routeRepo.findOne({
            where: { id: routeId, user_id: user.id },
        });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }

        const stops = await this.stopRepo.find({
            where: { route_id: routeId },
        });
        const targetStop = stops.find((s) => s.id === stopId);
        if (!targetStop) {
            throw new NotFoundException('Rota durağı bulunamadı.');
        }

        const otherStopsPhotosCount = stops
            .filter((s) => s.id !== stopId)
            .reduce((sum, s) => sum + (s.media_urls?.length ?? 0), 0);

        const combinedStopUrls = [
            ...(targetStop.media_urls ?? []),
            ...dto.media_urls,
        ];

        this.validateStopMediaQuota(
            user,
            combinedStopUrls,
            otherStopsPhotosCount,
        );

        targetStop.media_urls = combinedStopUrls;
        const savedStop = await this.stopRepo.save(targetStop);
        const quotaStatus = await this.getRouteMediaQuotaStatus(user, routeId);

        return {
            stop: savedStop,
            quota: quotaStatus,
        };
    }

    /**
     * Duraktan fotoğraf silindiğinde kotayı anında geri açar.
     */
    async removeMediaFromStop(
        user: User,
        routeId: string,
        stopId: string,
        dto: RemoveStopMediaDto,
    ) {
        const route = await this.routeRepo.findOne({
            where: { id: routeId, user_id: user.id },
        });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }

        const targetStop = await this.stopRepo.findOne({
            where: { id: stopId, route_id: routeId },
        });
        if (!targetStop) {
            throw new NotFoundException('Rota durağı bulunamadı.');
        }

        targetStop.media_urls = (targetStop.media_urls ?? []).filter(
            (url) => url !== dto.media_url,
        );
        const savedStop = await this.stopRepo.save(targetStop);
        const quotaStatus = await this.getRouteMediaQuotaStatus(user, routeId);

        return {
            stop: savedStop,
            quota: quotaStatus,
        };
    }

    /**
     * Merkezi medya kotası doğrulayıcısı (Free üye: durak başı max 3 foto, rota başı 20 durak x 3 = doğal 60 foto, video yasak).
     */
    validateStopMediaQuota(
        user: User,
        stopMediaUrls: string[],
        otherStopsPhotosCount = 0,
    ): void {
        if (this.usersService.isPremiumActive(user)) {
            return;
        }

        const maxPerStop = this.configService.get<number>(
            'quotas.freeMaxPhotosPerStop',
            3,
        );
        const maxStopsPerRoute = this.configService.get<number>(
            'quotas.freeMaxStopsPerRoute',
            20,
        );
        const maxPerRoute = maxStopsPerRoute * maxPerStop;

        const hasVideo = stopMediaUrls.some((url) =>
            /\.(mp4|mov|webm)(\?|$)/i.test(url),
        );
        if (hasVideo) {
            throw new ForbiddenException(
                'Ücretsiz üyelikte video yüklenemez; kısa video özelliği sadece Premium üyelere açıktır.',
            );
        }

        if (stopMediaUrls.length > maxPerStop) {
            throw new ForbiddenException(
                `Ücretsiz üyelikte durak başına en fazla ${maxPerStop} fotoğraf ekleyebilirsiniz (Upgrade to Premium).`,
            );
        }

        if (otherStopsPhotosCount + stopMediaUrls.length > maxPerRoute) {
            throw new ForbiddenException(
                `Ücretsiz üyelikte bir rotaya toplam en fazla ${maxPerRoute} fotoğraf ekleyebilirsiniz (Upgrade to Premium).`,
            );
        }
    }

    private getExtensionFromMime(mimeType: string): string {
        switch (mimeType) {
            case 'image/webp':
                return 'webp';
            case 'image/jpeg':
                return 'jpg';
            case 'video/mp4':
                return 'mp4';
            case 'video/webm':
                return 'webm';
            case 'video/quicktime':
                return 'mov';
            default:
                return 'bin';
        }
    }
}
