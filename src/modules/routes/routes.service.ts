import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Route } from './entities/route.entity';
import { RouteStop } from './entities/route-stop.entity';
import { RouteStay } from './entities/route-stay.entity';
import { RouteQuestion } from './entities/route-question.entity';
import { Place } from '../places/entities/place.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { PlacesService } from '../places/places.service';
import { GamificationService } from '../gamification/gamification.service';
import { MediaService } from '../media/media.service';
import {
    GlobalRank,
    PlaceStatus,
    RouteStatus,
    VerificationType,
} from '../../common/enums';
import {
    getContinentCountryMatchers,
    parseMultiCountryFilter,
} from '../../common/constants/geography.constants';
import {
    AnswerRouteQuestionDto,
    BatchGeofenceSyncDto,
    CreateRouteDto,
    CreateRouteQuestionDto,
    CreateRouteStayInputDto,
    CreateRouteStopInputDto,
    DismissPlaceInRouteDto,
    DiscoveryDeckQueryDto,
    ForkRouteDto,
    MatchExifRequestDto,
    PublishRouteDto,
    RestoreDismissedPlaceDto,
    SwipeRouteDto,
    UpdateRouteDto,
    UpdateRouteQaSettingsDto,
    UpdateRouteStopDto,
    UserQuestionsQueryDto,
    UserRoutesFilterQueryDto,
} from './dto/routes.dto';

@Injectable()
export class RoutesService {
    constructor(
        @InjectRepository(Route)
        private readonly routeRepo: Repository<Route>,
        @InjectRepository(RouteStop)
        private readonly stopRepo: Repository<RouteStop>,
        @InjectRepository(RouteStay)
        private readonly stayRepo: Repository<RouteStay>,
        @InjectRepository(Place)
        private readonly placeRepo: Repository<Place>,
        private readonly configService: ConfigService,
        private readonly usersService: UsersService,
        private readonly placesService: PlacesService,
        private readonly gamificationService: GamificationService,
        @Optional()
        private readonly mediaService?: MediaService,
        @Optional()
        @InjectRepository(RouteQuestion)
        private readonly questionRepo?: Repository<RouteQuestion>,
    ) {}

    /**
     * TRD 4.3: Free üye için maksimum taslak rota kotasını (3 + 1 Ek Kontenjan) denetler:
     * - CREATE: Yeni taslak veya Fork oluştururken normal taslak sayısı (was_published = false) >= 3 ise engeller.
     * - EDIT: Mevcut bir taslağı düzenlerken kullanıcının taslak sayısı kotayı aşıyorsa (örn. Premium bitişi sonrası) engeller.
     * - UNPUBLISH: Yayınlanmış (PUBLISHED) bir rotayı tekrar DRAFT'a çekerken normal 3 taslağı ezmez;
     *   bunun yerine "3 + 1" kuralı gereği maksimum 1 adet yayından çekilmiş taslak (was_published = true) kontenjanı tanır.
     */
    async enforceDraftRouteQuota(
        user: User,
        mode: 'CREATE' | 'EDIT' | 'UNPUBLISH' = 'CREATE',
        targetRoute?: Route,
    ): Promise<void> {
        if (this.usersService.isPremiumActive(user)) {
            return;
        }

        const maxNormalDrafts = this.configService.get<number>(
            'quotas.freeMaxDraftRoutes',
            3,
        );
        const maxUnpublishedEditDrafts = this.configService.get<number>(
            'quotas.freeMaxUnpublishedEditDrafts',
            1,
        );

        if (mode === 'UNPUBLISH') {
            const currentUnpublishedEditDrafts = await this.routeRepo.count({
                where: {
                    user_id: user.id,
                    status: RouteStatus.DRAFT,
                    was_published: true,
                },
            });

            if (currentUnpublishedEditDrafts >= maxUnpublishedEditDrafts) {
                throw new ForbiddenException(
                    `Ücretsiz üyelikte yayından taslağa çekilmiş en fazla ${maxUnpublishedEditDrafts} adet düzenleme rotası (+1 ek kontenjan) bulundurabilirsiniz. Lütfen önce diğer düzenlemenizi tamamlayıp yayınlayın veya Premium'a geçin.`,
                );
            }
            return;
        }

        if (mode === 'EDIT' && targetRoute) {
            if (targetRoute.status !== RouteStatus.DRAFT) {
                return;
            }
            if (targetRoute.was_published) {
                const currentUnpublishedEditDrafts = await this.routeRepo.count(
                    {
                        where: {
                            user_id: user.id,
                            status: RouteStatus.DRAFT,
                            was_published: true,
                        },
                    },
                );
                if (currentUnpublishedEditDrafts > maxUnpublishedEditDrafts) {
                    throw new ForbiddenException(
                        `Ücretsiz üyelikte yayından çekilmiş taslak kontenjanınız (${maxUnpublishedEditDrafts}) aşılmış durumda.`,
                    );
                }
                return;
            }

            const currentNormalDrafts = await this.routeRepo.count({
                where: {
                    user_id: user.id,
                    status: RouteStatus.DRAFT,
                    was_published: false,
                },
            });
            if (currentNormalDrafts > maxNormalDrafts) {
                throw new ForbiddenException(
                    `Ücretsiz üyelikte en fazla ${maxNormalDrafts} adet taslak rota düzenleyebilirsiniz. Devam etmek için fazla taslaklarınızı silin/yayınlayın veya Premium'a geçin.`,
                );
            }
            return;
        }

        // mode === 'CREATE'
        const currentNormalDrafts = await this.routeRepo.count({
            where: {
                user_id: user.id,
                status: RouteStatus.DRAFT,
                was_published: false,
            },
        });

        if (currentNormalDrafts >= maxNormalDrafts) {
            throw new ForbiddenException(
                `Ücretsiz üyelikte en fazla ${maxNormalDrafts} adet taslak rota bulundurabilirsiniz (Upgrade to Premium).`,
            );
        }
    }

    /**
     * Free üye için bir rotaya eklenebilecek maksimum durak sayısını (QUOTA_FREE_MAX_STOPS_PER_ROUTE = 20) denetler.
     */
    enforceRouteStopCountQuota(
        user: User,
        totalStopsAfterOperation: number,
    ): void {
        if (this.usersService.isPremiumActive(user)) {
            return;
        }

        const maxStopsPerRoute = this.configService.get<number>(
            'quotas.freeMaxStopsPerRoute',
            20,
        );

        if (totalStopsAfterOperation > maxStopsPerRoute) {
            throw new ForbiddenException(
                `Ücretsiz üyelikte bir rotaya en fazla ${maxStopsPerRoute} mekan (durak) ekleyebilirsiniz. Uzun seyahatlerinizi sınırsız durakla planlamak için Premium'a geçin.`,
            );
        }
    }

    /**
     * Medya kota doğrulamasını merkezi MediaService üzerinden yürütür.
     */
    private validateStopMediaViaService(
        user: User,
        stopMediaUrls: string[],
        otherStopsPhotosCount = 0,
    ): void {
        if (this.mediaService) {
            this.mediaService.validateStopMediaQuota(
                user,
                stopMediaUrls,
                otherStopsPhotosCount,
            );
        }
    }

    /**
     * Tarih aralığından gün sayısını hesaplar; tarih yoksa girilen veya varsayılan gün sayısını döner.
     */
    private resolveDurationDays(
        startDate?: Date | null,
        endDate?: Date | null,
        explicitDays?: number,
    ): number {
        if (explicitDays && explicitDays >= 1) {
            return explicitDays;
        }
        if (startDate && endDate) {
            const diffMs =
                new Date(endDate).getTime() - new Date(startDate).getTime();
            const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;
            return Math.max(1, days);
        }
        return 1;
    }

    /**
     * Kullanıcının yerel para birimindeki bütçeyi yaklaşık USD karşılığına dönüştürür (veya doğrudan girilen USD değerini kullanır).
     */
    private resolveBudgetUsd(
        amount: number | null,
        currency: string,
        explicitUsd?: number,
    ): number | null {
        if (explicitUsd !== undefined && explicitUsd !== null) {
            return explicitUsd;
        }
        if (amount === null || amount === undefined) {
            return null;
        }
        const ratesToUsd: Record<string, number> = {
            USD: 1,
            EUR: 1.08,
            GBP: 1.27,
            TRY: 0.029,
        };
        const factor = ratesToUsd[currency.toUpperCase()] ?? 0.029;
        return Number((Number(amount) * factor).toFixed(2));
    }

    async createDraftRoute(user: User, dto: CreateRouteDto) {
        await this.enforceDraftRouteQuota(user, 'CREATE');
        this.enforceRouteStopCountQuota(user, (dto.stops ?? []).length);

        let totalMediaCount = 0;
        for (const stop of dto.stops ?? []) {
            const urls = stop.media_urls ?? [];
            this.validateStopMediaViaService(user, urls, totalMediaCount);
            totalMediaCount += urls.length;
        }

        const startDate = dto.start_date ? new Date(dto.start_date) : null;
        const endDate = dto.end_date ? new Date(dto.end_date) : null;
        const currency = dto.currency ?? 'TRY';
        const budget = dto.estimated_total_budget ?? null;
        const adultsCount = dto.adults_count ?? 1;
        const childrenCount = dto.children_count ?? 0;
        const travelersCount =
            dto.travelers_count ?? Math.max(1, adultsCount + childrenCount);

        const route = this.routeRepo.create({
            user_id: user.id,
            title: dto.title,
            description: dto.description ?? null,
            countries: dto.countries ?? [],
            cities: dto.cities ?? [],
            status: RouteStatus.DRAFT,
            was_published: false,
            start_date: startDate,
            end_date: endDate,
            flexible_period: dto.flexible_period ?? null,
            adults_count: adultsCount,
            children_count: childrenCount,
            travelers_count: travelersCount,
            duration_days: this.resolveDurationDays(
                startDate,
                endDate,
                dto.duration_days,
            ),
            featured_media_urls: (dto.featured_media_urls ?? []).slice(0, 5),
            dismissed_place_ids: [],
            currency,
            estimated_total_budget: budget,
            estimated_total_budget_usd: this.resolveBudgetUsd(
                budget,
                currency,
                dto.estimated_total_budget_usd,
            ),
            budget_breakdown: dto.budget_breakdown ?? {},
            is_boosted: this.usersService.isPremiumActive(user),
        });

        const savedRoute = await this.routeRepo.save(route);

        const stops: RouteStop[] = [];
        for (let i = 0; i < (dto.stops ?? []).length; i++) {
            const s = dto.stops![i];
            const stopEntity = this.stopRepo.create({
                route_id: savedRoute.id,
                place_id: s.place_id,
                order_index: s.order_index ?? i,
                day_number: s.day_number ?? null,
                verification_type:
                    s.verification_type ?? VerificationType.MANUAL,
                rating: s.rating ?? null,
                comment: s.comment ?? null,
                selected_vibes: s.selected_vibes ?? [],
                selected_warnings: s.selected_warnings ?? [],
                media_urls: s.media_urls ?? [],
            });
            stops.push(await this.stopRepo.save(stopEntity));

            if (s.selected_vibes && s.selected_vibes.length > 0) {
                await this.placesService.addCommunityVibes(s.place_id, {
                    vibes: s.selected_vibes,
                });
            }
            if (s.selected_warnings && s.selected_warnings.length > 0) {
                await this.placesService.addCommunityWarnings(s.place_id, {
                    warnings: s.selected_warnings,
                });
            }
        }

        const stays: RouteStay[] = [];
        for (const st of dto.stays ?? []) {
            const stayEntity = this.stayRepo.create({
                route_id: savedRoute.id,
                stay_type: st.stay_type,
                place_id: st.place_id ?? null,
                region_name: st.region_name ?? null,
                nights_count: st.nights_count ?? 1,
            });
            stays.push(await this.stayRepo.save(stayEntity));
        }

        return this.getRouteDetails(savedRoute.id);
    }

    /**
     * Mevcut bir taslak veya yayınlanmış rotanın genel bilgilerini düzenler (Taslak kotası denetimli).
     */
    async updateRoute(user: User, routeId: string, dto: UpdateRouteDto) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException('Bu rotayı düzenleme yetkiniz yok.');
        }

        await this.enforceDraftRouteQuota(user, 'EDIT', route);

        if (dto.title !== undefined) route.title = dto.title;
        if (dto.description !== undefined) route.description = dto.description;
        if (dto.countries !== undefined) route.countries = dto.countries;
        if (dto.cities !== undefined) route.cities = dto.cities;
        if (dto.start_date !== undefined) {
            route.start_date = dto.start_date ? new Date(dto.start_date) : null;
        }
        if (dto.end_date !== undefined) {
            route.end_date = dto.end_date ? new Date(dto.end_date) : null;
        }
        if (dto.flexible_period !== undefined) {
            route.flexible_period = dto.flexible_period;
        }
        if (dto.adults_count !== undefined) {
            route.adults_count = dto.adults_count;
        }
        if (dto.children_count !== undefined) {
            route.children_count = dto.children_count;
        }
        if (dto.travelers_count !== undefined) {
            route.travelers_count = dto.travelers_count;
        } else if (
            dto.adults_count !== undefined ||
            dto.children_count !== undefined
        ) {
            route.travelers_count = Math.max(
                1,
                (route.adults_count ?? 1) + (route.children_count ?? 0),
            );
        }
        if (dto.duration_days !== undefined) {
            route.duration_days = dto.duration_days;
        } else if (dto.start_date !== undefined || dto.end_date !== undefined) {
            route.duration_days = this.resolveDurationDays(
                route.start_date,
                route.end_date,
            );
        }
        if (dto.featured_media_urls !== undefined) {
            route.featured_media_urls = dto.featured_media_urls.slice(0, 5);
        }
        if (dto.currency !== undefined) route.currency = dto.currency;
        if (dto.estimated_total_budget !== undefined) {
            route.estimated_total_budget = dto.estimated_total_budget;
        }
        if (dto.estimated_total_budget_usd !== undefined) {
            route.estimated_total_budget_usd = dto.estimated_total_budget_usd;
        } else if (
            dto.estimated_total_budget !== undefined ||
            dto.currency !== undefined
        ) {
            route.estimated_total_budget_usd = this.resolveBudgetUsd(
                route.estimated_total_budget,
                route.currency,
            );
        }
        if (dto.budget_breakdown !== undefined) {
            route.budget_breakdown = dto.budget_breakdown;
        }

        await this.routeRepo.save(route);
        return this.getRouteDetails(route.id);
    }

    /**
     * Yayınlanmış (PUBLISHED) bir rotayı düzenlemek amacıyla tekrar DRAFT statüsüne çeker.
     * Mevcut 3 taslak hakkını ezmez; "3 + 1" kuralındaki +1 ek düzenleme kontenjanını kullanır.
     */
    async unpublishRouteToDraft(user: User, routeId: string) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException('Bu rotayı düzenleme yetkiniz yok.');
        }

        if (route.status === RouteStatus.DRAFT) {
            return this.getRouteDetails(route.id);
        }

        await this.enforceDraftRouteQuota(user, 'UNPUBLISH', route);

        route.status = RouteStatus.DRAFT;
        route.was_published = true;
        await this.routeRepo.save(route);

        return this.getRouteDetails(route.id);
    }

    async addStopToRoute(
        user: User,
        routeId: string,
        dto: CreateRouteStopInputDto,
    ) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException('Bu rotayı düzenleme yetkiniz yok.');
        }

        await this.enforceDraftRouteQuota(user, 'EDIT', route);

        const existingStops = await this.stopRepo.find({
            where: { route_id: routeId },
        });
        this.enforceRouteStopCountQuota(user, existingStops.length + 1);

        const existingPhotosCount = existingStops.reduce(
            (sum, item) => sum + (item.media_urls?.length ?? 0),
            0,
        );

        const mediaUrls = dto.media_urls ?? [];
        this.validateStopMediaViaService(user, mediaUrls, existingPhotosCount);

        // Mekan kontrolü ve kapalı/çalışma günü uyarılarının alınması
        const placeWithWarnings = await this.placesService.findById(
            dto.place_id,
            false,
        );

        const stop = this.stopRepo.create({
            route_id: routeId,
            place_id: dto.place_id,
            order_index: dto.order_index ?? existingStops.length,
            day_number: dto.day_number ?? null,
            verification_type: dto.verification_type ?? VerificationType.MANUAL,
            rating: dto.rating ?? null,
            comment: dto.comment ?? null,
            selected_vibes: dto.selected_vibes ?? [],
            selected_warnings: dto.selected_warnings ?? [],
            media_urls: mediaUrls,
        });

        const savedStop = await this.stopRepo.save(stop);

        // Eğer mekan daha önce sola kaydırılanlar (dismissed_place_ids) listesindeyse oradan çıkar
        if (
            Array.isArray(route.dismissed_place_ids) &&
            route.dismissed_place_ids.includes(dto.place_id)
        ) {
            route.dismissed_place_ids = route.dismissed_place_ids.filter(
                (id) => id !== dto.place_id,
            );
            await this.routeRepo.save(route);
        }

        if (dto.selected_vibes && dto.selected_vibes.length > 0) {
            await this.placesService.addCommunityVibes(dto.place_id, {
                vibes: dto.selected_vibes,
            });
        }
        if (dto.selected_warnings && dto.selected_warnings.length > 0) {
            await this.placesService.addCommunityWarnings(dto.place_id, {
                warnings: dto.selected_warnings,
            });
        }

        return {
            ...savedStop,
            is_closed: placeWithWarnings.is_closed,
            status_warning: placeWithWarnings.status_warning,
            opening_hours_warning: placeWithWarnings.opening_hours_warning,
            community_warning_badges:
                placeWithWarnings.community_warning_badges,
            warnings: placeWithWarnings.warnings,
        };
    }

    /**
     * Rota oluşturma akışında sola kaydırılan (pas geçilen) bir mekanı rotanın `dismissed_place_ids` listesine kaydeder.
     * Böylece başka bir gezginin rotasına geçildiğinde aynı mekan tekrar gösterilmez; kullanıcı fikrini değiştirirse bu listeden rotaya ekleyebilir.
     */
    async dismissPlaceInRoute(
        user: User,
        routeId: string,
        dto: DismissPlaceInRouteDto,
    ) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException('Bu rotayı düzenleme yetkiniz yok.');
        }

        const currentDismissed = Array.isArray(route.dismissed_place_ids)
            ? route.dismissed_place_ids
            : [];
        if (!currentDismissed.includes(dto.place_id)) {
            route.dismissed_place_ids = [...currentDismissed, dto.place_id];
            await this.routeRepo.save(route);
        }

        return {
            route_id: route.id,
            dismissed_place_ids: route.dismissed_place_ids,
            count: route.dismissed_place_ids.length,
        };
    }

    /**
     * Bu rota oluşturulurken sola kaydırılmış (pas geçilmiş) mekanların detaylı listesini döner.
     */
    async getDismissedPlaces(user: User, routeId: string) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException(
                'Bu rotanın pas geçilen mekanlarını görüntüleme yetkiniz yok.',
            );
        }

        const dismissedIds = Array.isArray(route.dismissed_place_ids)
            ? route.dismissed_place_ids
            : [];
        const places =
            dismissedIds.length > 0
                ? await this.placeRepo.find({ where: { id: In(dismissedIds) } })
                : [];

        return {
            route_id: route.id,
            dismissed_place_ids: dismissedIds,
            places,
            count: places.length,
        };
    }

    /**
     * Kullanıcının daha önce sola kaydırdığı (pas geçtiği) bir mekanla ilgili fikrini değiştirip
     * rotasına durak (RouteStop) olarak eklemesini sağlar.
     */
    async restoreDismissedPlaceToRoute(
        user: User,
        routeId: string,
        placeId: string,
        dto?: RestoreDismissedPlaceDto,
    ) {
        return this.addStopToRoute(user, routeId, {
            place_id: placeId,
            day_number: dto?.day_number,
            order_index: dto?.order_index,
        });
    }

    /**
     * Mevcut bir durağı (sıra, gün, yorum, puan veya medya) günceller.
     * Hem taslak kotasını (enforceDraftRouteQuota) hem de MediaService üzerinden fotoğraf/video kotasını denetler.
     */
    async updateRouteStop(
        user: User,
        routeId: string,
        stopId: string,
        dto: UpdateRouteStopDto,
    ) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException('Bu rotayı düzenleme yetkiniz yok.');
        }

        await this.enforceDraftRouteQuota(user, 'EDIT', route);

        const stops = await this.stopRepo.find({
            where: { route_id: routeId },
        });
        const stop = stops.find((s) => s.id === stopId);
        if (!stop) {
            throw new NotFoundException('Rota durağı bulunamadı.');
        }

        if (dto.media_urls !== undefined) {
            const otherStopsPhotosCount = stops
                .filter((s) => s.id !== stopId)
                .reduce((sum, s) => sum + (s.media_urls?.length ?? 0), 0);

            this.validateStopMediaViaService(
                user,
                dto.media_urls,
                otherStopsPhotosCount,
            );
            stop.media_urls = dto.media_urls;
        }

        if (dto.order_index !== undefined) stop.order_index = dto.order_index;
        if (dto.day_number !== undefined) stop.day_number = dto.day_number;
        if (dto.verification_type !== undefined) {
            stop.verification_type = dto.verification_type;
        }
        if (dto.rating !== undefined) stop.rating = dto.rating;
        if (dto.comment !== undefined) stop.comment = dto.comment;

        if (dto.selected_vibes !== undefined) {
            stop.selected_vibes = dto.selected_vibes;
            if (dto.selected_vibes.length > 0) {
                await this.placesService.addCommunityVibes(stop.place_id, {
                    vibes: dto.selected_vibes,
                });
            }
        }
        if (dto.selected_warnings !== undefined) {
            stop.selected_warnings = dto.selected_warnings;
            if (dto.selected_warnings.length > 0) {
                await this.placesService.addCommunityWarnings(stop.place_id, {
                    warnings: dto.selected_warnings,
                });
            }
        }

        return this.stopRepo.save(stop);
    }

    async addStayToRoute(
        user: User,
        routeId: string,
        dto: CreateRouteStayInputDto,
    ): Promise<RouteStay> {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException('Bu rotayı düzenleme yetkiniz yok.');
        }

        await this.enforceDraftRouteQuota(user, 'EDIT', route);

        const stay = this.stayRepo.create({
            route_id: routeId,
            stay_type: dto.stay_type,
            place_id: dto.place_id ?? null,
            region_name: dto.region_name ?? null,
            nights_count: dto.nights_count ?? 1,
        });

        return this.stayRepo.save(stay);
    }

    /**
     * Manifesto 5.2.1 & 5.2.3: Hızlı Yayınlama (Smart Expense Modal & Feedback Şartı)
     */
    async publishRoute(user: User, routeId: string, dto: PublishRouteDto) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException('Bu rotayı yayınlama yetkiniz yok.');
        }

        const stops = await this.stopRepo.find({
            where: { route_id: routeId },
            order: { order_index: 'ASC' },
        });

        if (stops.length === 0) {
            throw new BadRequestException(
                'En az 1 mekan durağı olmayan rotalar yayınlanamaz.',
            );
        }

        // Yayınlama öncesi modalda toplu feedback gönderildiyse durakları güncelle
        if (dto.stop_feedbacks && dto.stop_feedbacks.length > 0) {
            const feedbackMap = new Map(
                dto.stop_feedbacks.map((f) => [f.stop_id, f]),
            );
            for (const stop of stops) {
                const fb = feedbackMap.get(stop.id);
                if (fb) {
                    stop.rating = fb.rating;
                    if (fb.comment !== undefined) stop.comment = fb.comment;
                    if (fb.selected_vibes !== undefined) {
                        stop.selected_vibes = fb.selected_vibes;
                        await this.placesService.addCommunityVibes(
                            stop.place_id,
                            {
                                vibes: fb.selected_vibes,
                            },
                        );
                    }
                    if (fb.selected_warnings !== undefined) {
                        stop.selected_warnings = fb.selected_warnings;
                        await this.placesService.addCommunityWarnings(
                            stop.place_id,
                            {
                                warnings: fb.selected_warnings,
                            },
                        );
                    }
                    await this.stopRepo.save(stop);
                }
            }
        }

        // Feedback Şartı (Manifesto 5.2.1): Duraklarda rating bulunmalı ve bütçe bilgisi girilmiş olmalı
        const unratedStop = stops.find(
            (s) => s.rating === null || s.rating === undefined,
        );
        if (unratedStop) {
            throw new BadRequestException(
                'Rotayı paylaşıma açabilmek için duraklara puan (1-5 yıldız) vermeniz gerekmektedir.',
            );
        }

        if (dto.currency) {
            route.currency = dto.currency;
        }
        if (dto.travelers_count !== undefined) {
            route.travelers_count = dto.travelers_count;
        }
        if (dto.duration_days !== undefined) {
            route.duration_days = dto.duration_days;
        } else {
            route.duration_days = this.resolveDurationDays(
                route.start_date,
                route.end_date,
                route.duration_days,
            );
        }
        if (dto.estimated_total_budget !== undefined) {
            route.estimated_total_budget = dto.estimated_total_budget;
        }
        if (dto.budget_breakdown !== undefined) {
            route.budget_breakdown = dto.budget_breakdown;
            if (
                route.estimated_total_budget === null &&
                Object.keys(dto.budget_breakdown).length > 0
            ) {
                route.estimated_total_budget = Object.values(
                    dto.budget_breakdown,
                ).reduce((acc, val) => acc + Number(val || 0), 0);
            }
        }

        if (
            route.estimated_total_budget === null &&
            Object.keys(route.budget_breakdown || {}).length === 0
        ) {
            throw new BadRequestException(
                'Rotayı yayınlamak için tahmini toplam bütçe veya kategori bazlı bütçe (Smart Expense) girilmelidir.',
            );
        }

        route.estimated_total_budget_usd = this.resolveBudgetUsd(
            route.estimated_total_budget,
            route.currency,
            dto.estimated_total_budget_usd,
        );

        // Kullanıcı öne çıkarılan 5 görseli seçtiyse kaydet; seçmediyse duraklardaki ilk 5 fotoğrafı otomatik slider görseli yap
        if (
            dto.featured_media_urls &&
            dto.featured_media_urls.length > 0
        ) {
            route.featured_media_urls = dto.featured_media_urls.slice(0, 5);
        } else if (
            !route.featured_media_urls ||
            route.featured_media_urls.length === 0
        ) {
            const allStopPhotos = stops.flatMap((s) => s.media_urls ?? []);
            route.featured_media_urls = allStopPhotos.slice(0, 5);
        }

        // Yayınlama sırasında konaklama (stays) gönderildiyse kaydet
        if (dto.stays && dto.stays.length > 0) {
            await this.stayRepo.delete({ route_id: route.id });
            for (const st of dto.stays) {
                const stayEntity = this.stayRepo.create({
                    route_id: route.id,
                    stay_type: st.stay_type,
                    place_id: st.place_id ?? null,
                    region_name: st.region_name ?? null,
                    nights_count: st.nights_count ?? 1,
                });
                await this.stayRepo.save(stayEntity);
            }
        }

        const wasAlreadyPublished =
            route.status === RouteStatus.PUBLISHED || route.was_published;
        route.status = RouteStatus.PUBLISHED;
        route.was_published = true;
        route.is_boosted = this.usersService.isPremiumActive(user);
        const saved = await this.routeRepo.save(route);

        if (!wasAlreadyPublished) {
            // Kalem kalem bütçe (budget_breakdown içinde en az 2 pozitif kalem) girene ekstra +20 detay bonusu (toplam 50p),
            // sadece genel toplam bütçe girene +30 puan verilir.
            const validBreakdownEntries = Object.values(
                route.budget_breakdown || {},
            ).filter((val) => Number(val) > 0).length;
            const publishRewardPoints = validBreakdownEntries >= 2 ? 50 : 30;

            await this.gamificationService.addRegionalPointsForRoute(
                user.id,
                saved.id,
                publishRewardPoints,
                true,
            );
            for (const stop of stops) {
                await this.gamificationService.recordPlaceVisitReward(
                    user.id,
                    stop.place_id,
                    stop.verification_type,
                );
            }
        }

        return this.getRouteDetails(saved.id);
    }

    /**
     * Rotayı toplulukla paylaşmadan, kişiye özel anı (PRIVATE_MEMORY / Private Repo) olarak saklar.
     * - Free Üye Kotası: Toplamda maksimum 5 adet kişiye özel anılaştırılmış rota (QUOTA_FREE_MAX_PRIVATE_MEMORIES = 5).
     * - Bütçe veya yıldız puanlama (Feedback) zorunluluğu aranmaz.
     */
    async saveRouteAsPrivateMemory(user: User, routeId: string) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException('Bu rotayı düzenleme yetkiniz yok.');
        }

        if (route.status === RouteStatus.PRIVATE_MEMORY) {
            return this.getRouteDetails(route.id);
        }

        if (!this.usersService.isPremiumActive(user)) {
            const maxPrivateMemories = this.configService.get<number>(
                'quotas.freeMaxPrivateMemories',
                5,
            );
            const currentPrivateMemories = await this.routeRepo.count({
                where: {
                    user_id: user.id,
                    status: RouteStatus.PRIVATE_MEMORY,
                },
            });

            if (currentPrivateMemories >= maxPrivateMemories) {
                throw new ForbiddenException(
                    `Ücretsiz üyelikte toplam en fazla ${maxPrivateMemories} adet kişiye özel anı (Private Rota) saklayabilirsiniz. Rotanızı toplulukla ücretsiz paylaşabilir (Public) veya sınırsız özel anı için Premium'a geçebilirsiniz.`,
                );
            }
        }

        route.status = RouteStatus.PRIVATE_MEMORY;
        const saved = await this.routeRepo.save(route);
        return this.getRouteDetails(saved.id);
    }

    /**
     * Bir kaynak rotadan çekilen toplam durak sayısına göre rota sahibinin hak ettiği kümülatif puanı hesaplar:
     * - 1 - 3 mekan: +5 puan
     * - 4 - 6 mekan: +15 puan
     * - 7 - 9 mekan: +25 puan
     * - 10+ mekan: +25 puan + (10 ve üzerindeki her mekan için +2 puan)
     */
    calculateForkRewardPoints(totalForkedStopsFromSource: number): number {
        if (totalForkedStopsFromSource <= 0) {
            return 0;
        }

        const tier1 = this.configService.get<number>(
            'quotas.forkRewardTier1Points',
            5,
        );
        const tier2 = this.configService.get<number>(
            'quotas.forkRewardTier2Points',
            15,
        );
        const tier3 = this.configService.get<number>(
            'quotas.forkRewardTier3Points',
            25,
        );
        const bonusPerExtra = this.configService.get<number>(
            'quotas.forkRewardBonusPerExtraStop',
            2,
        );

        if (totalForkedStopsFromSource <= 3) {
            return tier1;
        }
        if (totalForkedStopsFromSource <= 6) {
            return tier2;
        }
        if (totalForkedStopsFromSource <= 9) {
            return tier3;
        }

        // 10 ve üzeri her mekan için +2 puan (10 mekan -> 25 + 2 = 27, 11 mekan -> 29...)
        return tier3 + (totalForkedStopsFromSource - 9) * bonusPerExtra;
    }

    /**
     * Manifesto 5.2.2 & 5.2.5: Swipe & Pick ile Başka Gezginin Rotasından Kendi Rotana Mekan Çekme (Forking Stops)
     * Komple yeni bir rota oluşturmaz; kaynak rotadaki duraklardan kullanıcının sağa kaydırdıklarını (selected_stop_ids)
     * kullanıcının kendi taslak rotasına (target_route_id) ekler ve 20 durak kotasını denetler.
     * Tekil (Swipe) veya Toplu (Batch) çağrılarda fark (delta) hesabı yaparak fork_count = 1 ve adil kademeli puanlama sağlar.
     */
    async forkRoute(user: User, sourceRouteId: string, dto: ForkRouteDto) {
        const sourceRoute = await this.routeRepo.findOne({
            where: { id: sourceRouteId },
        });
        if (!sourceRoute || sourceRoute.status !== RouteStatus.PUBLISHED) {
            throw new NotFoundException(
                'Mekan çekilecek yayınlanmış kaynak rota bulunamadı.',
            );
        }

        const targetRoute = await this.routeRepo.findOne({
            where: { id: dto.target_route_id },
        });
        if (!targetRoute) {
            throw new NotFoundException(
                'Mekanların ekleneceği hedef rotanız bulunamadı.',
            );
        }
        if (targetRoute.user_id !== user.id) {
            throw new ForbiddenException(
                'Yalnızca kendi rotanıza mekan ekleyebilirsiniz.',
            );
        }

        await this.enforceDraftRouteQuota(user, 'EDIT', targetRoute);

        const sourceStops = await this.stopRepo.find({
            where: { route_id: sourceRouteId },
            order: { order_index: 'ASC' },
        });

        const selectedStops = sourceStops.filter((s) =>
            dto.selected_stop_ids.includes(s.id),
        );
        if (selectedStops.length === 0) {
            throw new BadRequestException(
                'Kaynak rotada seçilen duraklar bulunamadı.',
            );
        }

        const existingTargetStops = await this.stopRepo.find({
            where: { route_id: targetRoute.id },
            order: { order_index: 'ASC' },
        });

        // Hedef rotada bu kaynak rotadan daha önce kaç durak çekilmiş?
        const previousForkedFromThisSourceCount = existingTargetStops.filter(
            (s) => s.forked_from_route_id === sourceRoute.id,
        ).length;

        // Hedef rotada zaten bulunan mekanları mükerrer eklememek için ayıkla
        const existingPlaceIds = new Set(
            existingTargetStops.map((s) => s.place_id),
        );
        const stopsToAdd = selectedStops.filter(
            (s) => !existingPlaceIds.has(s.place_id),
        );

        // 20 durak kotası kontrolü (mevcut duraklar + yeni çekilecek duraklar)
        this.enforceRouteStopCountQuota(
            user,
            existingTargetStops.length + stopsToAdd.length,
        );

        const startOrderIndex = existingTargetStops.length;
        for (let i = 0; i < stopsToAdd.length; i++) {
            const srcStop = stopsToAdd[i];
            const newStop = this.stopRepo.create({
                route_id: targetRoute.id,
                place_id: srcStop.place_id,
                forked_from_route_id: sourceRoute.id,
                order_index: startOrderIndex + i,
                day_number: dto.day_number ?? srcStop.day_number ?? null,
                verification_type: VerificationType.MANUAL,
                rating: null,
                comment: null,
                selected_vibes: [],
                selected_warnings: [],
                media_urls: [],
            });
            await this.stopRepo.save(newStop);
        }

        // Hedef rotada ilk kez bir kaynaktan mekan çekildiyse referans olarak kaydet
        // Ayrıca çekilen duraklardan daha önce sola kaydırılmış olan varsa dismissed_place_ids listesinden temizle
        const addedPlaceIdSet = new Set(stopsToAdd.map((s) => s.place_id));
        const previousDismissed = Array.isArray(targetRoute.dismissed_place_ids)
            ? targetRoute.dismissed_place_ids
            : [];
        const updatedDismissed = previousDismissed.filter(
            (id) => !addedPlaceIdSet.has(id),
        );
        const dismissedChanged =
            updatedDismissed.length !== previousDismissed.length;

        if (
            (!targetRoute.forked_from_route_id && stopsToAdd.length > 0) ||
            dismissedChanged
        ) {
            if (!targetRoute.forked_from_route_id && stopsToAdd.length > 0) {
                targetRoute.forked_from_route_id = sourceRoute.id;
            }
            if (dismissedChanged) {
                targetRoute.dismissed_place_ids = updatedDismissed;
            }
            await this.routeRepo.save(targetRoute);
        }

        // Kademeli puan (Delta) ve tekil fork_count = 1 kontrolü
        if (stopsToAdd.length > 0) {
            if (previousForkedFromThisSourceCount === 0) {
                await this.routeRepo.increment(
                    { id: sourceRoute.id },
                    'fork_count',
                    1,
                );
            }

            if (sourceRoute.user_id !== user.id) {
                const previousPoints = this.calculateForkRewardPoints(
                    previousForkedFromThisSourceCount,
                );
                const newTotalPoints = this.calculateForkRewardPoints(
                    previousForkedFromThisSourceCount + stopsToAdd.length,
                );
                const deltaPoints = newTotalPoints - previousPoints;

                if (deltaPoints > 0) {
                    await this.gamificationService.addRegionalPointsForRoute(
                        sourceRoute.user_id,
                        sourceRoute.id,
                        deltaPoints,
                        false,
                    );
                }
            }
        }

        return this.getRouteDetails(targetRoute.id);
    }

    /**
     * Manifesto 5.2.5: İnteraktif Keşif Destesi (Swipe & Pick / Discovery Deck)
     * Sadece kendi veritabanımızdan (PostGIS) beslenir (Maliyet: $0).
     */
    async getDiscoveryDeck(
        query: DiscoveryDeckQueryDto,
        currentUser?: User | null,
    ) {
        const mode = query.mode ?? 'ROUTES';
        const limit = query.limit ?? 20;
        const shadowbanThreshold = this.configService.get<number>(
            'quotas.trustScoreShadowbanThreshold',
            50,
        );

        // Eğer kullanıcı aktif bir taslak rota için mekan/gezgin rotası inceliyorsa,
        // o rotada daha önce sağa (stops) veya sola (dismissed_place_ids) kaydırdığı mekanları tespit et
        const evaluatedPlaceIds = new Set<string>();
        if (query.exclude_for_route_id) {
            const activeDraftRoute = await this.routeRepo.findOne({
                where: { id: query.exclude_for_route_id },
            });
            if (activeDraftRoute) {
                for (const pid of activeDraftRoute.dismissed_place_ids ?? []) {
                    evaluatedPlaceIds.add(pid);
                }
                const activeDraftStops = await this.stopRepo.find({
                    where: { route_id: activeDraftRoute.id },
                });
                for (const st of activeDraftStops) {
                    evaluatedPlaceIds.add(st.place_id);
                }
            }
        }

        const requestedCities = (
            query.cities
                ? query.cities
                      .split(',')
                      .map((c) => c.trim())
                      .filter(Boolean)
                : query.city
                  ? [query.city.trim()]
                  : []
        ).map((c) => c.toLowerCase());

        // Kıta ve Çoklu Ülke filtrelerini çöz (Anasayfa Kıta > Çoklu Ülke seçimi)
        const multiCountryFilter = parseMultiCountryFilter(query.countries);
        const continentMatchers =
            multiCountryFilter.codes.length === 0 &&
            query.continent &&
            query.continent !== 'GLOBAL'
                ? getContinentCountryMatchers(query.continent)
                : { codes: [], namesAndCodesLower: [] };
        const effectiveCountryCodes =
            multiCountryFilter.codes.length > 0
                ? multiCountryFilter.codes
                : continentMatchers.codes;
        const effectiveCountryNamesLower =
            multiCountryFilter.namesAndCodesLower.length > 0
                ? multiCountryFilter.namesAndCodesLower
                : continentMatchers.namesAndCodesLower;

        if (mode === 'PLACES') {
            const qb = this.placeRepo
                .createQueryBuilder('place')
                .where('place.status = :status', {
                    status: PlaceStatus.ACTIVE,
                });

            if (evaluatedPlaceIds.size > 0) {
                qb.andWhere('place.id NOT IN (:...evaluatedPlaceIds)', {
                    evaluatedPlaceIds: Array.from(evaluatedPlaceIds),
                });
            }

            if (effectiveCountryCodes.length > 0) {
                qb.andWhere(
                    'UPPER(place.country_code) IN (:...effectiveCountryCodes)',
                    { effectiveCountryCodes },
                );
            }

            if (query.lat !== undefined && query.lng !== undefined) {
                qb.andWhere(
                    `ST_DWithin(place.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)`,
                    {
                        lng: query.lng,
                        lat: query.lat,
                        radius: query.radius ?? 15000,
                    },
                );
            }

            if (requestedCities.length === 1) {
                qb.andWhere('place.city ILIKE :city', {
                    city: requestedCities[0],
                });
            } else if (requestedCities.length > 1) {
                qb.andWhere('LOWER(place.city) IN (:...requestedCities)', {
                    requestedCities,
                });
            }

            if (query.ui_category) {
                qb.andWhere('place.ui_category = :uiCategory', {
                    uiCategory: query.ui_category,
                });
            }

            if (query.vibe) {
                qb.andWhere(`place.community_vibes ? :vibe`, {
                    vibe: query.vibe,
                });
            }

            const places = await qb
                .orderBy('place.verified_hype_score', 'DESC')
                .limit(limit)
                .getMany();

            return {
                mode: 'PLACES',
                items: places,
                count: places.length,
                excluded_evaluated_places_count: evaluatedPlaceIds.size,
                can_fetch_from_google: places.length < 5,
            };
        }

        // ROUTES mode: Trust score >= 50 olan, Elite/Boosted öncelikli yayınlanmış rotalar
        const qb = this.routeRepo
            .createQueryBuilder('route')
            .innerJoin(User, 'creator', 'creator.id = route.user_id')
            .where('route.status = :status', { status: RouteStatus.PUBLISHED })
            .andWhere('creator.trust_score >= :shadowbanThreshold', {
                shadowbanThreshold,
            });

        if (query.elite_only === 'true') {
            qb.andWhere('creator.global_rank IN (:...eliteRanks)', {
                eliteRanks: [
                    GlobalRank.ELITE_TRAVELER,
                    GlobalRank.MASTER_OF_ROUTES,
                ],
            });
        }

        if (query.max_budget !== undefined) {
            qb.andWhere('route.estimated_total_budget <= :maxBudget', {
                maxBudget: query.max_budget,
            });
        }

        if (query.flexible_period) {
            qb.andWhere('route.flexible_period = :flexiblePeriod', {
                flexiblePeriod: query.flexible_period,
            });
        }

        if (
            effectiveCountryCodes.length > 0 ||
            requestedCities.length > 0 ||
            query.ui_category ||
            query.vibe ||
            (query.lat !== undefined && query.lng !== undefined)
        ) {
            qb.innerJoin(
                RouteStop,
                'stop',
                'stop.route_id = route.id',
            ).innerJoin(Place, 'place', 'place.id = stop.place_id');

            if (effectiveCountryCodes.length > 0) {
                qb.andWhere(
                    '(UPPER(place.country_code) IN (:...effectiveCountryCodes) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(route.countries) AS rc WHERE LOWER(rc) IN (:...effectiveCountryNamesLower)))',
                    {
                        effectiveCountryCodes,
                        effectiveCountryNamesLower,
                    },
                );
            }
            if (requestedCities.length === 1) {
                qb.andWhere('place.city ILIKE :city', {
                    city: requestedCities[0],
                });
            } else if (requestedCities.length > 1) {
                qb.andWhere('LOWER(place.city) IN (:...requestedCities)', {
                    requestedCities,
                });
            }
            if (query.ui_category) {
                qb.andWhere('place.ui_category = :uiCategory', {
                    uiCategory: query.ui_category,
                });
            }
            if (query.vibe) {
                qb.andWhere(`place.community_vibes ? :vibe`, {
                    vibe: query.vibe,
                });
            }
            if (query.lat !== undefined && query.lng !== undefined) {
                qb.andWhere(
                    `ST_DWithin(place.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)`,
                    {
                        lng: query.lng,
                        lat: query.lat,
                        radius: query.radius ?? 15000,
                    },
                );
            }
        }

        const routes = await qb
            .orderBy('route.is_boosted', 'DESC')
            .addOrderBy('route.fork_count', 'DESC')
            .addOrderBy('route.swipe_right_count', 'DESC')
            .addOrderBy('route.created_at', 'DESC')
            .take(limit)
            .getMany();

        // Anasayfa kartları için her rotanın altında maksimum 7 mekan ismini (tag) hazırla
        // Ayrıca Gezgin Rotaları (exclude_for_route_id) modunda daha önce A gezgininde sağa/sola kaydırılmış
        // ortak mekanları (X, Z) B gezgininin kartında tekrar göstermemek için `unseen_stops` listesini hazırla
        const enrichedFeedRoutes = await Promise.all(
            routes.map(async (r) => {
                const routeStops = await this.stopRepo.find({
                    where: { route_id: r.id },
                    order: { order_index: 'ASC' },
                });
                const topPlaceIds = routeStops
                    .slice(0, 7)
                    .map((s) => s.place_id);
                const places =
                    topPlaceIds.length > 0
                        ? await this.placeRepo.find({
                              where: { id: In(topPlaceIds) },
                          })
                        : [];
                const placeNameMap = new Map(
                    places.map((p) => [p.id, p.default_name]),
                );
                const previewPlaceNames = topPlaceIds
                    .map((pid) => placeNameMap.get(pid))
                    .filter((name): name is string => Boolean(name));

                const unseenStops =
                    evaluatedPlaceIds.size > 0
                        ? routeStops.filter(
                              (s) => !evaluatedPlaceIds.has(s.place_id),
                          )
                        : routeStops;

                return {
                    ...r,
                    preview_place_names: previewPlaceNames,
                    total_stops_count: routeStops.length,
                    unseen_stops_count: unseenStops.length,
                    unseen_stop_ids: unseenStops.map((s) => s.id),
                };
            }),
        );

        return {
            mode: 'ROUTES',
            personalized_for_preferences:
                currentUser?.onboarding_preferences ?? [],
            items: enrichedFeedRoutes,
            count: enrichedFeedRoutes.length,
        };
    }

    /**
     * Keşif Destesi sağa/sola kaydırma ve Trust Score güncellemesi
     */
    async recordSwipe(routeId: string, dto: SwipeRouteDto) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }

        if (dto.direction === 'RIGHT') {
            await this.routeRepo.increment(
                { id: routeId },
                'swipe_right_count',
                1,
            );
        } else {
            await this.routeRepo.increment(
                { id: routeId },
                'swipe_left_count',
                1,
            );
        }

        const updatedTrustScore =
            await this.gamificationService.recalculateUserTrustScore(
                route.user_id,
            );

        return {
            route_id: route.id,
            direction: dto.direction,
            creator_trust_score: updatedTrustScore,
        };
    }

    async getRouteDetails(routeId: string) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }

        const stops = await this.stopRepo.find({
            where: { route_id: routeId },
            order: { order_index: 'ASC' },
        });

        const stays = await this.stayRepo.find({
            where: { route_id: routeId },
        });

        const placeIds = Array.from(new Set(stops.map((s) => s.place_id)));
        const places =
            placeIds.length > 0
                ? await this.placeRepo.find({ where: { id: In(placeIds) } })
                : [];
        const placeMap = new Map(places.map((p) => [p.id, p]));

        // Manifesto 5.1.5: Kapanmış mekanlar, kapalı çalışma günleri ve topluluk saha uyarıları birlikte döner
        const enrichedStops = stops.map((stop) => {
            const place = placeMap.get(stop.place_id) ?? null;
            const warningInfo = place
                ? this.placesService.buildPlaceWarnings(place)
                : {
                      is_closed: false,
                      status_warning: null,
                      opening_hours_warning: null,
                      community_warning_badges: [],
                      warnings: [],
                  };
            return {
                ...stop,
                has_photos: (stop.media_urls?.length ?? 0) > 0,
                place,
                closed_badge: warningInfo.status_warning,
                ...warningInfo,
            };
        });

        return {
            ...route,
            stops: enrichedStops,
            stays,
        };
    }

    /**
     * Paylaşılan Rotalar (PUBLISHED) ve Kişisel Anılarım (PRIVATE_MEMORY) listelerini
     * Ülke, Şehir ve Tarih (başlangıç/bitiş veya yıl) bazlı filtreler.
     */
    private applyRouteLocationAndDateFilters(
        routes: Route[],
        filter?: UserRoutesFilterQueryDto,
    ): Route[] {
        if (!filter) {
            return routes;
        }

        return routes.filter((route) => {
            if (filter.status && route.status !== filter.status) {
                return false;
            }

            if (filter.country) {
                const targetCountry = filter.country.trim().toLowerCase();
                const routeCountries = (route.countries ?? []).map((c) =>
                    c.toLowerCase(),
                );
                if (!routeCountries.some((c) => c.includes(targetCountry))) {
                    return false;
                }
            }

            if (filter.city) {
                const targetCity = filter.city.trim().toLowerCase();
                const routeCities = (route.cities ?? []).map((c) =>
                    c.toLowerCase(),
                );
                if (!routeCities.some((c) => c.includes(targetCity))) {
                    return false;
                }
            }

            const referenceDate = route.start_date
                ? new Date(route.start_date)
                : new Date(route.created_at);

            if (filter.year !== undefined) {
                if (referenceDate.getUTCFullYear() !== Number(filter.year)) {
                    return false;
                }
            }

            if (filter.start_date) {
                const fromDate = new Date(filter.start_date);
                if (referenceDate < fromDate) {
                    return false;
                }
            }

            if (filter.end_date) {
                const toDate = new Date(filter.end_date);
                const endRef = route.end_date
                    ? new Date(route.end_date)
                    : referenceDate;
                if (endRef > toDate) {
                    return false;
                }
            }

            return true;
        });
    }

    async getUserRoutes(
        userId: string,
        includeDrafts = false,
        filter?: UserRoutesFilterQueryDto,
    ) {
        const whereCondition = includeDrafts
            ? { user_id: userId }
            : { user_id: userId, status: RouteStatus.PUBLISHED };

        const routes = await this.routeRepo.find({
            where: whereCondition,
            order: { created_at: 'DESC' },
        });

        return this.applyRouteLocationAndDateFilters(routes, filter);
    }

    /**
     * Kullanıcının anılaştırılmış rotalarını (PRIVATE_MEMORY ve PUBLISHED) ülke/şehir/tarih filtresiyle
     * ve kalan Private Anı kotasıyla birlikte getirir.
     */
    async getMyMemoryRoutes(user: User, filter?: UserRoutesFilterQueryDto) {
        const isPremium = this.usersService.isPremiumActive(user);
        const maxPrivateMemories = isPremium
            ? null
            : this.configService.get<number>(
                  'quotas.freeMaxPrivateMemories',
                  5,
              );

        const memoryRoutes = await this.routeRepo.find({
            where: [
                { user_id: user.id, status: RouteStatus.PRIVATE_MEMORY },
                { user_id: user.id, status: RouteStatus.PUBLISHED },
            ],
            order: { created_at: 'DESC' },
        });

        const usedPrivateCount = memoryRoutes.filter(
            (r) => r.status === RouteStatus.PRIVATE_MEMORY,
        ).length;

        const filteredItems = this.applyRouteLocationAndDateFilters(
            memoryRoutes,
            filter,
        );

        return {
            items: filteredItems,
            count: filteredItems.length,
            quota: {
                is_premium: isPremium,
                max_private_memories: maxPrivateMemories,
                used_private_memories: usedPrivateCount,
                remaining_private_memories:
                    maxPrivateMemories !== null
                        ? Math.max(0, maxPrivateMemories - usedPrivateCount)
                        : null,
            },
        };
    }

    /**
     * Rotaya ait Soru & Cevap (Q&A) kayıtlarını (`route_questions` tablosundan) listeler.
     */
    async getRouteQuestions(routeId: string) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }

        if (!this.questionRepo) {
            return {
                route_id: route.id,
                is_qa_enabled: route.is_qa_enabled,
                items: [],
                count: 0,
            };
        }

        const questions = await this.questionRepo.find({
            where: { route_id: route.id },
            order: { created_at: 'DESC' },
        });

        return {
            route_id: route.id,
            is_qa_enabled: route.is_qa_enabled,
            items: questions,
            count: questions.length,
        };
    }

    /**
     * Bir rotaya yeni soru sorar (`route_questions` tablosuna kaydeder).
     * Eğer rota sahibi ilgili rotanın Q&A özelliğini kapattıysa (`is_qa_enabled = false`) izin vermez.
     */
    async askRouteQuestion(
        user: User,
        routeId: string,
        dto: CreateRouteQuestionDto,
    ) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (!route.is_qa_enabled) {
            throw new ForbiddenException(
                'Bu rota için Soru & Cevap (Q&A) özelliği rota sahibi tarafından kapatılmıştır.',
            );
        }
        if (!this.questionRepo) {
            throw new NotFoundException('Soru & Cevap servisi hazır değil.');
        }

        const created = this.questionRepo.create({
            route_id: route.id,
            route_owner_id: route.user_id,
            asker_user_id: user.id,
            question_text: dto.question_text.trim(),
            answer_text: null,
            answered_at: null,
        });

        return this.questionRepo.save(created);
    }

    /**
     * Kullanıcının kendi profilindeki "Soru & Cevap (Q&A)" sekmesi:
     * Kendi rotalarına sorulan tüm soruları (bekleyen / cevaplanan filtreli) getirir.
     */
    async getMyReceivedQuestions(user: User, query?: UserQuestionsQueryDto) {
        if (!this.questionRepo) {
            return { items: [], count: 0 };
        }

        const allQuestions = await this.questionRepo.find({
            where: query?.route_id
                ? { route_owner_id: user.id, route_id: query.route_id }
                : { route_owner_id: user.id },
            order: { created_at: 'DESC' },
        });

        const statusFilter = query?.status ?? 'ALL';
        const filtered = allQuestions.filter((q) => {
            if (statusFilter === 'UNANSWERED') return !q.answer_text;
            if (statusFilter === 'ANSWERED') return Boolean(q.answer_text);
            return true;
        });

        return {
            status: statusFilter,
            items: filtered,
            count: filtered.length,
            unanswered_count: allQuestions.filter((q) => !q.answer_text).length,
        };
    }

    /**
     * Rota sahibinin kendi profilinden sorulan bir soruyu cevaplamasını sağlar.
     */
    async answerRouteQuestion(
        user: User,
        questionId: string,
        dto: AnswerRouteQuestionDto,
    ) {
        if (!this.questionRepo) {
            throw new NotFoundException('Soru & Cevap servisi hazır değil.');
        }

        const question = await this.questionRepo.findOne({
            where: { id: questionId },
        });
        if (!question) {
            throw new NotFoundException('Soru bulunamadı.');
        }
        if (question.route_owner_id !== user.id) {
            throw new ForbiddenException(
                'Yalnızca kendi rotanıza sorulan soruları cevaplayabilirsiniz.',
            );
        }

        question.answer_text = dto.answer_text.trim();
        question.answered_at = new Date();
        return this.questionRepo.save(question);
    }

    /**
     * Rota sahibinin kendi profilinden ilgili rotanın Q&A (Soru & Cevap) fonksiyonunu açıp kapatmasını sağlar.
     */
    async updateRouteQaSettings(
        user: User,
        routeId: string,
        dto: UpdateRouteQaSettingsDto,
    ) {
        const route = await this.routeRepo.findOne({ where: { id: routeId } });
        if (!route) {
            throw new NotFoundException('Rota bulunamadı.');
        }
        if (route.user_id !== user.id) {
            throw new ForbiddenException(
                'Bu rotanın Soru & Cevap ayarlarını değiştirme yetkiniz yok.',
            );
        }

        route.is_qa_enabled = dto.is_qa_enabled;
        await this.routeRepo.save(route);

        return {
            route_id: route.id,
            is_qa_enabled: route.is_qa_enabled,
        };
    }

    /**
     * Manifesto 5.3.1: Cihaz içi (Client-Side) ayrıştırılan EXIF koordinatlarını PostGIS mekanlarıyla eşleştirir.
     * Ayrı bir memories tablosu kullanmaz; doğrudan rotaya (RouteStop) eklenecek mekan gruplarını ve aday mekanları döner.
     */
    async matchExifCoordinates(user: User, dto: MatchExifRequestDto) {
        const radius = dto.match_radius_meters ?? 250;
        const groupedByPlace = new Map<
            string,
            {
                place: Place;
                verification_type: VerificationType;
                photos: Array<{ photo_local_id: string; timestamp: string }>;
            }
        >();
        const unmatchedPhotos: Array<{
            photo_local_id: string;
            timestamp: string;
            reason: string;
        }> = [];

        for (const item of dto.photos) {
            if (item.lat === undefined || item.lng === undefined) {
                unmatchedPhotos.push({
                    photo_local_id: item.photo_local_id,
                    timestamp: item.timestamp,
                    reason: 'MISSING_EXIF_GPS',
                });
                continue;
            }

            const nearestPlace = await this.placeRepo
                .createQueryBuilder('place')
                .where('place.status = :status', { status: PlaceStatus.ACTIVE })
                .andWhere(
                    `ST_DWithin(place.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)`,
                    { lng: item.lng, lat: item.lat, radius },
                )
                .orderBy(
                    `ST_Distance(place.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)`,
                    'ASC',
                )
                .setParameters({ lng: item.lng, lat: item.lat })
                .getOne();

            if (!nearestPlace) {
                unmatchedPhotos.push({
                    photo_local_id: item.photo_local_id,
                    timestamp: item.timestamp,
                    reason: 'NO_NEARBY_PLACE_IN_DB',
                });
                continue;
            }

            const existingGroup = groupedByPlace.get(nearestPlace.id);
            if (existingGroup) {
                existingGroup.photos.push({
                    photo_local_id: item.photo_local_id,
                    timestamp: item.timestamp,
                });
            } else {
                groupedByPlace.set(nearestPlace.id, {
                    place: nearestPlace,
                    verification_type: VerificationType.PHOTO_VERIFIED,
                    photos: [
                        {
                            photo_local_id: item.photo_local_id,
                            timestamp: item.timestamp,
                        },
                    ],
                });
            }
        }

        let candidatePlaces: Place[] = [];
        if (dto.active_route_id) {
            const route = await this.routeRepo.findOne({
                where: { id: dto.active_route_id, user_id: user.id },
            });
            if (route) {
                const stops = await this.stopRepo.find({
                    where: { route_id: route.id },
                    order: { order_index: 'ASC' },
                });
                const placeIds = Array.from(
                    new Set(stops.map((s) => s.place_id)),
                );
                if (placeIds.length > 0) {
                    candidatePlaces = await this.placeRepo.find({
                        where: { id: In(placeIds) },
                    });
                }
            }
        }

        return {
            matched_groups: Array.from(groupedByPlace.values()),
            unmatched_photos: unmatchedPhotos,
            candidate_places: candidatePlaces,
        };
    }

    /**
     * Manifesto 5.2.4: Sadece Premium üyelere açık toplu Geofence senkronizasyonu.
     * Ayrı bir memories tablosuna yazmaz; ziyaretleri doğrudan hedef rotaya (veya yeni bir PRIVATE_MEMORY rotasına) RouteStop olarak ekler.
     */
    async batchGeofenceSync(user: User, dto: BatchGeofenceSyncDto) {
        let targetRoute: Route | null = null;
        let currentStopCount = 0;

        if (dto.target_route_id) {
            targetRoute = await this.routeRepo.findOne({
                where: { id: dto.target_route_id, user_id: user.id },
            });
            if (!targetRoute) {
                throw new NotFoundException('Eklenecek hedef rota bulunamadı.');
            }
            currentStopCount = await this.stopRepo.count({
                where: { route_id: targetRoute.id },
            });
        } else {
            const todayLabel = new Date().toISOString().slice(0, 10);
            const createdRoute = this.routeRepo.create({
                user_id: user.id,
                title: dto.title ?? `Geofence Seyahat Anısı (${todayLabel})`,
                description:
                    'Akıllı Geofence ile otomatik oluşturulan seyahat anısı.',
                status: RouteStatus.PRIVATE_MEMORY,
                was_published: false,
                currency: 'TRY',
                budget_breakdown: {},
                is_boosted: this.usersService.isPremiumActive(user),
            });
            targetRoute = await this.routeRepo.save(createdRoute);
        }

        const appendedStops: RouteStop[] = [];

        for (const visit of dto.visits) {
            const stop = this.stopRepo.create({
                route_id: targetRoute.id,
                place_id: visit.place_id,
                order_index: currentStopCount++,
                day_number: visit.day_number ?? null,
                verification_type: VerificationType.GEO_VERIFIED,
                rating: null,
                comment: visit.comment ?? null,
                selected_vibes: [],
                selected_warnings: [],
                media_urls: visit.media_urls ?? [],
            });
            appendedStops.push(await this.stopRepo.save(stop));

            await this.gamificationService.recordPlaceVisitReward(
                user.id,
                visit.place_id,
                VerificationType.GEO_VERIFIED,
            );
        }

        return this.getRouteDetails(targetRoute.id);
    }
}
