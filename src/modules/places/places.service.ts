import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { Place } from './entities/place.entity';
import { PlaceList } from './entities/place-list.entity';
import { PlaceListItem } from './entities/place-list-item.entity';
import { Route } from '../routes/entities/route.entity';
import { RouteStop } from '../routes/entities/route-stop.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { PlaceStatus, RouteStatus, UiCategory } from '../../common/enums';
import {
    AddPlaceToListDto,
    AddPlaceVibesDto,
    AddPlaceWarningsDto,
    CreatePlaceListDto,
    FetchGooglePlacesDto,
    NearbyPlacesQueryDto,
    PlaceRelatedRoutesQueryDto,
    PlacesFeedQueryDto,
    SearchPlacesQueryDto,
} from './dto/places.dto';

export const PLACE_REFRESH_QUEUE = 'place-refresh';

export interface GooglePlaceCandidate {
    google_place_id: string;
    name: string;
    lat: number;
    lng: number;
    country_code?: string;
    city?: string;
    district?: string;
    types: string[];
    business_status?: string;
    weekday_descriptions?: string[];
    raw_payload: Record<string, unknown>;
}

export interface PlaceWarningsInfo {
    is_closed: boolean;
    status_warning: string | null;
    opening_hours_warning: string | null;
    community_warning_badges: Array<{ label: string; votes: number }>;
    warnings: string[];
}

@Injectable()
export class PlacesService {
    private readonly logger = new Logger(PlacesService.name);

    constructor(
        @InjectRepository(Place)
        private readonly placeRepo: Repository<Place>,
        private readonly configService: ConfigService,
        @Optional()
        @InjectQueue(PLACE_REFRESH_QUEUE)
        private readonly placeRefreshQueue?: Queue,
        @Optional()
        @InjectRepository(PlaceList)
        private readonly placeListRepo?: Repository<PlaceList>,
        @Optional()
        @InjectRepository(PlaceListItem)
        private readonly placeListItemRepo?: Repository<PlaceListItem>,
        @Optional()
        private readonly usersService?: UsersService,
        @Optional()
        @InjectRepository(Route)
        private readonly routeRepo?: Repository<Route>,
        @Optional()
        @InjectRepository(RouteStop)
        private readonly routeStopRepo?: Repository<RouteStop>,
    ) {}

    /**
     * Google Place types dizisini 3 ana UI kategorisine (FOOD, ACCOMMODATION, DESTINATION) eşler.
     */
    mapGoogleTypesToUiCategory(types: string[]): UiCategory {
        const foodTypes = new Set([
            'restaurant',
            'cafe',
            'bakery',
            'bar',
            'meal_takeaway',
            'meal_delivery',
            'food',
            'coffee_shop',
            'seafood_restaurant',
        ]);
        const stayTypes = new Set([
            'lodging',
            'hotel',
            'motel',
            'campground',
            'rv_park',
            'hostel',
            'resort_hotel',
            'bed_and_breakfast',
            'cottage',
        ]);

        for (const t of types) {
            if (foodTypes.has(t)) {
                return UiCategory.FOOD;
            }
            if (stayTypes.has(t)) {
                return UiCategory.ACCOMMODATION;
            }
        }
        return UiCategory.DESTINATION;
    }

    mapBusinessStatusToPlaceStatus(businessStatus?: string): PlaceStatus {
        if (businessStatus === 'CLOSED_PERMANENTLY') {
            return PlaceStatus.CLOSED_PERMANENTLY;
        }
        if (businessStatus === 'CLOSED_TEMPORARILY') {
            return PlaceStatus.CLOSED_TEMPORARILY;
        }
        return PlaceStatus.ACTIVE;
    }

    /**
     * Google regularOpeningHours.weekdayDescriptions dizisinden kapalı günleri ("Pazartesi: Kapalı" / "Monday: Closed") ayrıştırır.
     */
    parseOpeningHours(weekdayDescriptions?: string[]): {
        weekday_descriptions: string[];
        closed_days: string[];
    } | null {
        if (!weekdayDescriptions || weekdayDescriptions.length === 0) {
            return null;
        }

        const closedDays: string[] = [];
        for (const line of weekdayDescriptions) {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const dayName = parts[0].trim();
                const hoursText = parts.slice(1).join(':').trim().toLowerCase();
                if (
                    hoursText.includes('kapalı') ||
                    hoursText.includes('closed')
                ) {
                    closedDays.push(dayName);
                }
            }
        }

        return {
            weekday_descriptions: weekdayDescriptions,
            closed_days: closedDays,
        };
    }

    /**
     * Mekan için kapalı olma durumu, haftalık kapalı gün ve topluluk saha uyarılarını (Yüksek UV, Tırmanış vb.) üretir.
     * Örn: "İzmir Arkeoloji Müzesi Pazartesi günleri kapalıdır."
     */
    buildPlaceWarnings(place: Place): PlaceWarningsInfo {
        let statusWarning: string | null = null;
        if (place.status === PlaceStatus.CLOSED_PERMANENTLY) {
            statusWarning = `${place.default_name} kalıcı olarak kapanmıştır.`;
        } else if (place.status === PlaceStatus.CLOSED_TEMPORARILY) {
            statusWarning = `${place.default_name} geçici olarak kapalıdır.`;
        }

        let openingHoursWarning: string | null = null;
        const closedDays = place.opening_hours?.closed_days ?? [];
        if (closedDays.length > 0) {
            openingHoursWarning = `${place.default_name} ${closedDays.join(', ')} günleri kapalıdır.`;
        }

        // Topluluk saha uyarılarını oy sayısına göre büyükten küçüğe sırala
        const communityWarningBadges = Object.entries(
            place.community_warnings || {},
        )
            .filter(([, votes]) => votes > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([label, votes]) => ({ label, votes }));

        const warnings: string[] = [];
        if (statusWarning) warnings.push(statusWarning);
        if (openingHoursWarning) warnings.push(openingHoursWarning);
        if (communityWarningBadges.length > 0) {
            const topLabels = communityWarningBadges
                .slice(0, 3)
                .map((b) => `${b.label} (${b.votes} oy)`)
                .join(', ');
            warnings.push(`Gezgin Saha Uyarısı: ${topLabels}`);
        }

        return {
            is_closed: place.status !== PlaceStatus.ACTIVE,
            status_warning: statusWarning,
            opening_hours_warning: openingHoursWarning,
            community_warning_badges: communityWarningBadges,
            warnings,
        };
    }

    /**
     * Kullanıcının verilen mekanları hangi kişisel listelerinde (Flag) tuttuğunu haritalar.
     * Sahibinden.com tarzı hızlı liste seçimi ve kart üzerindeki bayrak durumu için kullanılır.
     */
    private async getFlaggedListMapForUser(
        userId?: string,
        placeIds: string[] = [],
    ): Promise<Map<string, string[]>> {
        const result = new Map<string, string[]>();
        if (!userId || placeIds.length === 0 || !this.placeListItemRepo) {
            return result;
        }

        const items = await this.placeListItemRepo.find({
            where: {
                user_id: userId,
                place_id: In(placeIds),
            },
        });

        for (const item of items) {
            const existing = result.get(item.place_id) ?? [];
            existing.push(item.list_id);
            result.set(item.place_id, existing);
        }
        return result;
    }

    /**
     * TRD 4.1: DB-First PostGIS + Çoklu Dil JSONB + Trigram Fuzzy Arama Sorgusu
     * Kullanıcıya iki ayrı arama modu sunar:
     * 1 - NEARBY ("Yakınımdaki Konumları Göster")
     * 2 - GLOBAL ("Konum Bağımsız Genel Arama")
     * Not: Kapalı mekanlar da sonuçlarda gösterilir (gereksiz Google API çağrısını önlemek için),
     * ancak aktif mekanların altında sıralanır ve status_warning / opening_hours_warning ile döner.
     */
    async searchPlaces(dto: SearchPlacesQueryDto, currentUser?: User | null) {
        const userLanguage = dto.lang || 'tr';
        const limit = dto.limit ?? 20;
        const searchMode =
            dto.search_mode ??
            (dto.lat !== undefined && dto.lng !== undefined
                ? 'NEARBY'
                : 'GLOBAL');

        const qb = this.placeRepo.createQueryBuilder('place');

        if (dto.q && dto.q.trim().length > 0) {
            const searchQuery = dto.q.trim();
            // Hem tam alt kelime (ILIKE/LIKE) hem de yazım hatası toleranslı Trigram (word_similarity >= 0.3) araması
            qb.andWhere(
                `(
                    normalize_search_text(place.default_name) LIKE '%' || normalize_search_text(:rawQ) || '%'
                    OR normalize_search_text(COALESCE(place.name_translations ->> :lang, '')) LIKE '%' || normalize_search_text(:rawQ) || '%'
                    OR word_similarity(normalize_search_text(:rawQ), normalize_search_text(place.default_name)) >= 0.3
                    OR word_similarity(normalize_search_text(:rawQ), normalize_search_text(COALESCE(place.name_translations ->> :lang, ''))) >= 0.3
                )`,
                { rawQ: searchQuery, lang: userLanguage },
            );
        }

        // Yalnızca NEARBY ("Yakınımdaki Konumları Göster") seçildiğinde konum yarıçapı filtresi uygulanır;
        // GLOBAL ("Konum Bağımsız Genel Arama") modunda tüm veritabanında konum kısıtsız aranır.
        if (
            searchMode === 'NEARBY' &&
            dto.lat !== undefined &&
            dto.lng !== undefined
        ) {
            const radiusInMeters = dto.radius ?? 5000;
            qb.andWhere(
                `ST_DWithin(place.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)`,
                { lng: dto.lng, lat: dto.lat, radius: radiusInMeters },
            );
        }

        if (dto.ui_category) {
            qb.andWhere('place.ui_category = :uiCategory', {
                uiCategory: dto.ui_category,
            });
        }

        if (dto.city) {
            qb.andWhere('place.city ILIKE :city', { city: dto.city });
        }

        if (dto.district) {
            qb.andWhere('place.district ILIKE :district', {
                district: dto.district,
            });
        }

        if (dto.country_code) {
            qb.andWhere('place.country_code = :countryCode', {
                countryCode: dto.country_code.toUpperCase(),
            });
        }

        if (dto.google_type) {
            qb.andWhere(`place.google_types @> :googleType::jsonb`, {
                googleType: JSON.stringify([dto.google_type]),
            });
        }

        if (dto.vibe) {
            qb.andWhere(`place.community_vibes ? :vibe`, { vibe: dto.vibe });
        }

        // Önce ACTIVE olanlar, sonra benzerlik skoru ve verified_hype_score
        qb.orderBy(
            `CASE WHEN place.status = 'ACTIVE' THEN 0 ELSE 1 END`,
            'ASC',
        );

        if (dto.q && dto.q.trim().length > 0) {
            qb.addOrderBy(
                `GREATEST(
                    word_similarity(normalize_search_text(:rawQ), normalize_search_text(place.default_name)),
                    word_similarity(normalize_search_text(:rawQ), normalize_search_text(COALESCE(place.name_translations ->> :lang, '')))
                )`,
                'DESC',
            ).addOrderBy('place.verified_hype_score', 'DESC');
        } else {
            qb.addOrderBy('place.verified_hype_score', 'DESC');
        }

        const places = await qb.limit(limit).getMany();
        const flaggedMap = await this.getFlaggedListMapForUser(
            currentUser?.id,
            places.map((p) => p.id),
        );

        const enrichedItems = places.map((place) => {
            const flaggedInListIds = flaggedMap.get(place.id) ?? [];
            return {
                ...place,
                is_flagged: flaggedInListIds.length > 0,
                flagged_in_list_ids: flaggedInListIds,
                ...this.buildPlaceWarnings(place),
            };
        });

        const trimmedQueryLength = dto.q?.trim().length ?? 0;

        return {
            search_mode: searchMode,
            items: enrichedItems,
            count: enrichedItems.length,
            can_fetch_from_google: trimmedQueryLength >= 3,
            min_google_query_length: 3,
            google_fetch_prompt:
                "Aradığınız mekanı bulamadınız mı? Google Haritalar'da Ara",
        };
    }

    /**
     * Arama ekranı ilk açıldığında (henüz arama yapılmadan önce) aşağı doğru Infinite Scroll (Sonsuz Kaydırma)
     * olarak akan mekan vitrini. Kullanıcının daha önce tercih ettiği (rotalarına eklediği veya flag'lediği)
     * mekan kategorileri ve vibe'ları öncelikli olacak şekilde rastgele keşif mekanlarıyla harmanlanır.
     */
    async getPersonalizedPlacesFeed(
        query: PlacesFeedQueryDto,
        currentUser?: User | null,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        const offset = (page - 1) * limit;
        const seed = query.seed?.trim() || 'been_here_default_seed';

        const preferredCategories = new Set<string>();
        const interactedPlaceIds = new Set<string>();

        if (currentUser?.id) {
            if (this.placeListItemRepo) {
                const flaggedItems = await this.placeListItemRepo.find({
                    where: { user_id: currentUser.id },
                    take: 50,
                });
                for (const fi of flaggedItems) {
                    interactedPlaceIds.add(fi.place_id);
                }
            }

            if (this.routeRepo && this.routeStopRepo) {
                const userRoutes = await this.routeRepo.find({
                    where: { user_id: currentUser.id },
                    take: 20,
                });
                const routeIds = userRoutes.map((r) => r.id);
                if (routeIds.length > 0) {
                    const userStops = await this.routeStopRepo.find({
                        where: { route_id: In(routeIds) },
                        take: 100,
                    });
                    for (const st of userStops) {
                        interactedPlaceIds.add(st.place_id);
                    }
                }
            }

            if (interactedPlaceIds.size > 0) {
                const pastPlaces = await this.placeRepo.find({
                    where: { id: In(Array.from(interactedPlaceIds)) },
                });
                for (const pp of pastPlaces) {
                    if (pp.ui_category) {
                        preferredCategories.add(pp.ui_category);
                    }
                }
            }
        }

        const qb = this.placeRepo
            .createQueryBuilder('place')
            .where('place.status = :status', { status: PlaceStatus.ACTIVE });

        const preferredCategoryList = Array.from(preferredCategories);
        if (preferredCategoryList.length > 0) {
            qb.orderBy(
                `CASE WHEN place.ui_category IN (:...preferredCategories) THEN 0 ELSE 1 END`,
                'ASC',
            ).setParameter('preferredCategories', preferredCategoryList);
            qb.addOrderBy('md5(place.id::text || :seed)', 'ASC').setParameter(
                'seed',
                seed,
            );
        } else {
            qb.orderBy('md5(place.id::text || :seed)', 'ASC').setParameter(
                'seed',
                seed,
            );
        }

        const places = await qb.skip(offset).take(limit).getMany();
        const flaggedMap = await this.getFlaggedListMapForUser(
            currentUser?.id,
            places.map((p) => p.id),
        );

        const enrichedItems = places.map((place) => {
            const flaggedInListIds = flaggedMap.get(place.id) ?? [];
            return {
                ...place,
                is_flagged: flaggedInListIds.length > 0,
                flagged_in_list_ids: flaggedInListIds,
                is_preferred_category: preferredCategories.has(
                    place.ui_category,
                ),
                ...this.buildPlaceWarnings(place),
            };
        });

        return {
            page,
            limit,
            seed,
            has_more: enrichedItems.length === limit,
            prioritized_categories: preferredCategoryList,
            items: enrichedItems,
            count: enrichedItems.length,
        };
    }

    /**
     * Mekan kartındaki sekme veya çekmecede gösterilecek olan "Bu Mekanın İlintili Olduğu Rotalar" (PUBLISHED).
     */
    async getPlaceRelatedRoutes(
        placeId: string,
        query: PlaceRelatedRoutesQueryDto,
    ) {
        await this.findById(placeId, false);

        if (!this.routeRepo || !this.routeStopRepo) {
            return {
                place_id: placeId,
                items: [],
                count: 0,
            };
        }

        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        const offset = (page - 1) * limit;
        const shadowbanThreshold = this.configService.get<number>(
            'quotas.trustScoreShadowbanThreshold',
            50,
        );

        const matchingStops = await this.routeStopRepo.find({
            where: { place_id: placeId },
        });
        const candidateRouteIds = Array.from(
            new Set(matchingStops.map((s) => s.route_id)),
        );

        if (candidateRouteIds.length === 0) {
            return {
                place_id: placeId,
                page,
                limit,
                has_more: false,
                items: [],
                count: 0,
            };
        }

        const qb = this.routeRepo
            .createQueryBuilder('route')
            .innerJoin(User, 'creator', 'creator.id = route.user_id')
            .where('route.id IN (:...candidateRouteIds)', { candidateRouteIds })
            .andWhere('route.status = :status', {
                status: RouteStatus.PUBLISHED,
            })
            .andWhere('creator.trust_score >= :shadowbanThreshold', {
                shadowbanThreshold,
            })
            .orderBy('route.is_boosted', 'DESC')
            .addOrderBy('route.fork_count', 'DESC')
            .addOrderBy('route.swipe_right_count', 'DESC')
            .addOrderBy('route.created_at', 'DESC')
            .skip(offset)
            .take(limit);

        const routes = await qb.getMany();

        const enrichedRoutes = await Promise.all(
            routes.map(async (r) => {
                const stops = await this.routeStopRepo!.find({
                    where: { route_id: r.id },
                    order: { order_index: 'ASC' },
                });
                const topPlaceIds = stops.slice(0, 7).map((s) => s.place_id);
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

                return {
                    ...r,
                    preview_place_names: previewPlaceNames,
                    total_stops_count: stops.length,
                };
            }),
        );

        return {
            place_id: placeId,
            page,
            limit,
            has_more: enrichedRoutes.length === limit,
            items: enrichedRoutes,
            count: enrichedRoutes.length,
        };
    }

    /**
     * Manifesto 5.1.2: Yakındaki Benzer Noktalar ve Konum Bazlı Keşif (Contextual Nearby Discovery)
     * Keşif önerilerinde sadece ACTIVE mekanlar önerilir ve çalışma günü uyarıları eklenir.
     */
    async findNearbyContextual(placeId: string, query: NearbyPlacesQueryDto) {
        const basePlace = await this.findById(placeId, false);
        const [lng, lat] = basePlace.location.coordinates;
        const radius = query.radius ?? 3000;
        const limit = query.limit ?? 15;

        const qb = this.placeRepo
            .createQueryBuilder('place')
            .where('place.status = :status', { status: PlaceStatus.ACTIVE })
            .andWhere('place.id != :placeId', { placeId: basePlace.id })
            .andWhere('place.ui_category = :uiCategory', {
                uiCategory: basePlace.ui_category,
            })
            .andWhere(
                `ST_DWithin(place.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)`,
                { lng, lat, radius },
            )
            .orderBy('place.verified_hype_score', 'DESC')
            .limit(limit);

        const nearby = await qb.getMany();
        const enrichedNearby = nearby.map((p) => ({
            ...p,
            ...this.buildPlaceWarnings(p),
        }));

        return {
            base_place_id: basePlace.id,
            ui_category: basePlace.ui_category,
            radius_meters: radius,
            items: enrichedNearby,
            count: enrichedNearby.length,
            can_fetch_from_google: enrichedNearby.length < 5,
        };
    }

    /**
     * TRD 4.2 Adım 3: Mekan Detayı + 30 Günlük Lazy Refresh
     */
    async findById(
        id: string,
        triggerLazyRefresh = true,
    ): Promise<Place & PlaceWarningsInfo> {
        const place = await this.placeRepo.findOne({ where: { id } });
        if (!place) {
            throw new NotFoundException('Mekan bulunamadı.');
        }

        if (triggerLazyRefresh && this.isPlaceStale(place.last_synced_at)) {
            void this.enqueueLazyRefresh(place.id, place.google_place_id);
        }

        return {
            ...place,
            ...this.buildPlaceWarnings(place),
        };
    }

    private isPlaceStale(lastSyncedAt: Date): boolean {
        const refreshDays = this.configService.get<number>(
            'googlePlaces.lazyRefreshDays',
            30,
        );
        const thresholdMs = refreshDays * 24 * 60 * 60 * 1000;
        return Date.now() - new Date(lastSyncedAt).getTime() > thresholdMs;
    }

    private async enqueueLazyRefresh(
        placeId: string,
        googlePlaceId: string,
    ): Promise<void> {
        try {
            if (this.placeRefreshQueue) {
                await this.placeRefreshQueue.add(
                    'refresh-place-data',
                    { placeId, googlePlaceId },
                    {
                        jobId: `refresh-${placeId}`,
                        removeOnComplete: true,
                        removeOnFail: 10,
                    },
                );
                return;
            }
        } catch (err) {
            this.logger.warn(
                `BullMQ enqueue failed for place ${placeId}, falling back to async refresh: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            );
        }

        // Fallback if Redis/BullMQ is unavailable
        setImmediate(() => {
            this.refreshPlaceFromGoogle(placeId).catch((e) =>
                this.logger.warn(`Async place refresh error: ${String(e)}`),
            );
        });
    }

    /**
     * TRD 4.2: Kullanıcı tetiklemeli Google Places API çağrısı ve JSONB Upsert
     * Tek harfli ("A" vb.) aramaların Google Places API'den binlerce alakasız mekan döndürmesini
     * önlemek için en az 3 karakterli arama metni zorunludur.
     */
    async fetchAndUpsertFromGoogle(
        dto: FetchGooglePlacesDto,
    ): Promise<Place[]> {
        const trimmedQuery = dto.query?.trim() ?? '';
        if (trimmedQuery.length < 3) {
            throw new BadRequestException(
                'Google Haritalar araması için lütfen en az 3 karakterli bir mekan adı girin.',
            );
        }

        const lang = dto.lang || 'tr';
        const candidates = await this.callGooglePlacesApi(
            {
                ...dto,
                query: trimmedQuery,
            },
            lang,
        );
        const results: Place[] = [];

        for (const candidate of candidates) {
            const upserted = await this.upsertSingleGoogleCandidate(
                candidate,
                lang,
            );
            results.push(upserted);
        }

        return results;
    }

    async upsertSingleGoogleCandidate(
        candidate: GooglePlaceCandidate,
        userLang: string,
    ): Promise<Place> {
        const existing = await this.placeRepo.findOne({
            where: { google_place_id: candidate.google_place_id },
        });

        const newStatus = this.mapBusinessStatusToPlaceStatus(
            candidate.business_status,
        );
        const uiCategory = this.mapGoogleTypesToUiCategory(candidate.types);
        const parsedOpeningHours = this.parseOpeningHours(
            candidate.weekday_descriptions,
        );

        if (existing) {
            existing.name_translations = {
                ...(existing.name_translations || {}),
                [userLang]: candidate.name,
            };
            existing.google_types = Array.from(
                new Set([...(existing.google_types || []), ...candidate.types]),
            );
            existing.ui_category = uiCategory;
            existing.status = newStatus;
            if (parsedOpeningHours) {
                existing.opening_hours = parsedOpeningHours;
            }
            existing.raw_google_payload = candidate.raw_payload;
            existing.last_synced_at = new Date();
            return this.placeRepo.save(existing);
        }

        const created = this.placeRepo.create({
            google_place_id: candidate.google_place_id,
            default_name: candidate.name,
            name_translations: { [userLang]: candidate.name },
            location: {
                type: 'Point',
                coordinates: [candidate.lng, candidate.lat],
            },
            country_code: candidate.country_code ?? 'TR',
            city: candidate.city ?? null,
            district: candidate.district ?? null,
            google_types: candidate.types,
            ui_category: uiCategory,
            community_vibes: {},
            community_warnings: {},
            verified_hype_score: 0,
            status: newStatus,
            opening_hours: parsedOpeningHours,
            raw_google_payload: candidate.raw_payload,
            last_synced_at: new Date(),
        });

        return this.placeRepo.save(created);
    }

    /**
     * Arka planda 30 günlük Lazy Refresh işleyicisi (Soft-Delete, Place Status ve Çalışma Günleri uyumlu)
     */
    async refreshPlaceFromGoogle(placeId: string): Promise<Place | null> {
        const place = await this.placeRepo.findOne({ where: { id: placeId } });
        if (!place) {
            return null;
        }

        const apiKey = this.configService.get<string>('googlePlaces.apiKey');
        if (apiKey) {
            try {
                const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
                    place.google_place_id,
                )}?fields=id,displayName,businessStatus,types,location,regularOpeningHours`;
                const response = await fetch(url, {
                    headers: { 'X-Goog-Api-Key': apiKey },
                });
                if (response.ok) {
                    const data = (await response.json()) as {
                        businessStatus?: string;
                        displayName?: { text?: string; languageCode?: string };
                        types?: string[];
                        regularOpeningHours?: {
                            weekdayDescriptions?: string[];
                        };
                    };
                    place.status = this.mapBusinessStatusToPlaceStatus(
                        data.businessStatus,
                    );
                    if (
                        data.displayName?.text &&
                        data.displayName?.languageCode
                    ) {
                        place.name_translations = {
                            ...place.name_translations,
                            [data.displayName.languageCode]:
                                data.displayName.text,
                        };
                    }
                    if (Array.isArray(data.types) && data.types.length > 0) {
                        place.google_types = data.types;
                        place.ui_category = this.mapGoogleTypesToUiCategory(
                            data.types,
                        );
                    }
                    if (data.regularOpeningHours?.weekdayDescriptions) {
                        place.opening_hours = this.parseOpeningHours(
                            data.regularOpeningHours.weekdayDescriptions,
                        );
                    }
                    place.raw_google_payload = data;
                }
            } catch (error) {
                this.logger.warn(
                    `Failed to refresh place ${place.google_place_id} from Google API: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }

        place.last_synced_at = new Date();
        return this.placeRepo.save(place);
    }

    /**
     * Manifesto 5.1.4: Topluluk Kaynaklı Vibe Etiketleri Oylaması
     */
    async addCommunityVibes(
        placeId: string,
        dto: AddPlaceVibesDto,
    ): Promise<Place> {
        const place = await this.placeRepo.findOne({ where: { id: placeId } });
        if (!place) {
            throw new NotFoundException('Mekan bulunamadı.');
        }

        const updatedVibes: Record<string, number> = {
            ...(place.community_vibes || {}),
        };

        for (const rawVibe of dto.vibes) {
            const vibe = rawVibe.trim();
            if (!vibe) continue;
            updatedVibes[vibe] = (updatedVibes[vibe] ?? 0) + 1;
        }

        place.community_vibes = updatedVibes;
        return this.placeRepo.save(place);
    }

    /**
     * Manifesto 5.1.4: Topluluk Kaynaklı Saha Uyarıları Oylaması (Yüksek UV, Tırmanış, Yabani Yaşam vb.)
     */
    async addCommunityWarnings(
        placeId: string,
        dto: AddPlaceWarningsDto,
    ): Promise<Place> {
        const place = await this.placeRepo.findOne({ where: { id: placeId } });
        if (!place) {
            throw new NotFoundException('Mekan bulunamadı.');
        }

        const updatedWarnings: Record<string, number> = {
            ...(place.community_warnings || {}),
        };

        for (const rawWarning of dto.warnings) {
            const warning = rawWarning.trim();
            if (!warning) continue;
            updatedWarnings[warning] = (updatedWarnings[warning] ?? 0) + 1;
        }

        place.community_warnings = updatedWarnings;
        return this.placeRepo.save(place);
    }

    /**
     * Manifesto 5.1.6: Kullanıcının Kayıtlı Mekan Listeleri (Google Maps Flag / Saved Places)
     * - Free Üye Kotası: En fazla 3 liste, liste başına en fazla 10 mekan (.env üzerinden okunur).
     * - Premium Üye: Sınırsız liste ve liste başına sınırsız mekan.
     * - İsim önerisi: "Favori Liste 1", "Favori Liste 2", "Favori Liste 3"...
     */
    async getMyPlaceLists(user: User) {
        if (!this.placeListRepo || !this.placeListItemRepo) {
            throw new NotFoundException('Liste servisi yapılandırılmamış.');
        }

        const isPremium = this.usersService?.isPremiumActive(user) ?? false;
        const maxLists = isPremium
            ? null
            : this.configService.get<number>('quotas.freeMaxPlaceLists', 3);
        const maxPlacesPerList = isPremium
            ? null
            : this.configService.get<number>('quotas.freeMaxPlacesPerList', 10);

        const lists = await this.placeListRepo.find({
            where: { user_id: user.id },
            order: { created_at: 'ASC' },
        });

        const enrichedLists = await Promise.all(
            lists.map(async (list) => {
                const itemCount = await this.placeListItemRepo!.count({
                    where: { list_id: list.id },
                });
                return {
                    ...list,
                    item_count: itemCount,
                    max_places_per_list: maxPlacesPerList,
                };
            }),
        );

        return {
            items: enrichedLists,
            count: enrichedLists.length,
            suggested_next_title: `Favori Liste ${enrichedLists.length + 1}`,
            quota: {
                is_premium: isPremium,
                max_lists: maxLists,
                max_places_per_list: maxPlacesPerList,
            },
        };
    }

    async createPlaceList(
        user: User,
        dto: CreatePlaceListDto,
    ): Promise<PlaceList> {
        if (!this.placeListRepo) {
            throw new NotFoundException('Liste servisi yapılandırılmamış.');
        }

        const isPremium = this.usersService?.isPremiumActive(user) ?? false;
        const existingCount = await this.placeListRepo.count({
            where: { user_id: user.id },
        });

        if (!isPremium) {
            const maxLists = this.configService.get<number>(
                'quotas.freeMaxPlaceLists',
                3,
            );
            if (existingCount >= maxLists) {
                throw new ForbiddenException(
                    `Ücretsiz üyelikle en fazla ${maxLists} adet mekan listesi oluşturabilirsiniz. Sınırsız liste için Premium'a geçin.`,
                );
            }
        }

        const resolvedTitle =
            dto.title && dto.title.trim().length > 0
                ? dto.title.trim()
                : `Favori Liste ${existingCount + 1}`;

        const created = this.placeListRepo.create({
            user_id: user.id,
            title: resolvedTitle,
            icon: dto.icon?.trim() || null,
        });

        return this.placeListRepo.save(created);
    }

    async getPlaceListDetails(user: User, listId: string) {
        if (!this.placeListRepo || !this.placeListItemRepo) {
            throw new NotFoundException('Liste servisi yapılandırılmamış.');
        }

        const list = await this.placeListRepo.findOne({
            where: { id: listId, user_id: user.id },
        });
        if (!list) {
            throw new NotFoundException('Mekan listesi bulunamadı.');
        }

        const listItems = await this.placeListItemRepo.find({
            where: { list_id: list.id },
            order: { created_at: 'DESC' },
        });

        const placeIds = listItems.map((i) => i.place_id);
        const places =
            placeIds.length > 0
                ? await this.placeRepo.find({ where: { id: In(placeIds) } })
                : [];
        const placeMap = new Map(places.map((p) => [p.id, p]));

        const enrichedItems = listItems.map((item) => {
            const place = placeMap.get(item.place_id);
            return {
                id: item.id,
                list_id: item.list_id,
                place_id: item.place_id,
                note: item.note,
                created_at: item.created_at,
                place: place
                    ? {
                          ...place,
                          ...this.buildPlaceWarnings(place),
                      }
                    : null,
            };
        });

        return {
            ...list,
            items: enrichedItems,
            item_count: enrichedItems.length,
        };
    }

    async addPlaceToList(
        user: User,
        listId: string,
        dto: AddPlaceToListDto,
    ): Promise<PlaceListItem> {
        if (!this.placeListRepo || !this.placeListItemRepo) {
            throw new NotFoundException('Liste servisi yapılandırılmamış.');
        }

        const list = await this.placeListRepo.findOne({
            where: { id: listId, user_id: user.id },
        });
        if (!list) {
            throw new NotFoundException('Mekan listesi bulunamadı.');
        }

        const place = await this.placeRepo.findOne({
            where: { id: dto.place_id },
        });
        if (!place) {
            throw new NotFoundException('Listeye eklenecek mekan bulunamadı.');
        }

        const alreadyExists = await this.placeListItemRepo.findOne({
            where: { list_id: list.id, place_id: place.id },
        });
        if (alreadyExists) {
            throw new ConflictException(
                'Bu mekan zaten ilgili listenizde kayıtlı.',
            );
        }

        const isPremium = this.usersService?.isPremiumActive(user) ?? false;
        if (!isPremium) {
            const maxPlacesPerList = this.configService.get<number>(
                'quotas.freeMaxPlacesPerList',
                10,
            );
            const currentItemCount = await this.placeListItemRepo.count({
                where: { list_id: list.id },
            });
            if (currentItemCount >= maxPlacesPerList) {
                throw new ForbiddenException(
                    `Ücretsiz üyelikle bir listeye en fazla ${maxPlacesPerList} adet mekan ekleyebilirsiniz. Sınırsız mekan eklemek için Premium'a geçin.`,
                );
            }
        }

        const item = this.placeListItemRepo.create({
            list_id: list.id,
            user_id: user.id,
            place_id: place.id,
            note: dto.note?.trim() || null,
        });

        return this.placeListItemRepo.save(item);
    }

    async removePlaceFromList(
        user: User,
        listId: string,
        placeId: string,
    ): Promise<{ removed: boolean }> {
        if (!this.placeListRepo || !this.placeListItemRepo) {
            throw new NotFoundException('Liste servisi yapılandırılmamış.');
        }

        const list = await this.placeListRepo.findOne({
            where: { id: listId, user_id: user.id },
        });
        if (!list) {
            throw new NotFoundException('Mekan listesi bulunamadı.');
        }

        await this.placeListItemRepo.delete({
            list_id: list.id,
            place_id: placeId,
        });

        return { removed: true };
    }

    async deletePlaceList(
        user: User,
        listId: string,
    ): Promise<{ deleted: boolean }> {
        if (!this.placeListRepo || !this.placeListItemRepo) {
            throw new NotFoundException('Liste servisi yapılandırılmamış.');
        }

        const list = await this.placeListRepo.findOne({
            where: { id: listId, user_id: user.id },
        });
        if (!list) {
            throw new NotFoundException('Mekan listesi bulunamadı.');
        }

        await this.placeListItemRepo.delete({ list_id: list.id });
        await this.placeListRepo.delete({ id: list.id });

        return { deleted: true };
    }

    private async callGooglePlacesApi(
        dto: FetchGooglePlacesDto,
        lang: string,
    ): Promise<GooglePlaceCandidate[]> {
        const apiKey = this.configService.get<string>('googlePlaces.apiKey');

        if (apiKey) {
            const endpoint = dto.query
                ? 'https://places.googleapis.com/v1/places:searchText'
                : 'https://places.googleapis.com/v1/places:searchNearby';

            const body: Record<string, unknown> = {
                languageCode: lang,
            };

            if (dto.query) {
                body.textQuery = dto.query;
                if (dto.lat !== undefined && dto.lng !== undefined) {
                    body.locationBias = {
                        circle: {
                            center: { latitude: dto.lat, longitude: dto.lng },
                            radius: dto.radius ?? 5000,
                        },
                    };
                }
            } else if (dto.lat !== undefined && dto.lng !== undefined) {
                body.locationRestriction = {
                    circle: {
                        center: { latitude: dto.lat, longitude: dto.lng },
                        radius: dto.radius ?? 5000,
                    },
                };
            }

            if (dto.google_type) {
                body.includedTypes = [dto.google_type];
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask':
                        'places.id,places.displayName,places.location,places.types,places.businessStatus,places.regularOpeningHours,places.addressComponents',
                },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                const payload = (await response.json()) as {
                    places?: Array<{
                        id: string;
                        displayName?: { text?: string };
                        location?: { latitude: number; longitude: number };
                        types?: string[];
                        businessStatus?: string;
                        regularOpeningHours?: {
                            weekdayDescriptions?: string[];
                        };
                    }>;
                };

                return (payload.places ?? []).map((p) => ({
                    google_place_id: p.id,
                    name: p.displayName?.text ?? 'Unknown Place',
                    lat: p.location?.latitude ?? dto.lat ?? 38.4189,
                    lng: p.location?.longitude ?? dto.lng ?? 27.1287,
                    types: p.types ?? ['point_of_interest'],
                    business_status: p.businessStatus,
                    weekday_descriptions:
                        p.regularOpeningHours?.weekdayDescriptions,
                    raw_payload: p,
                }));
            }
        }

        // DEV_MOCK_EXTERNAL_SERVICES fallback: Gerçekçi çoklu dil ve çalışma saatleri destekli mock Google Places verisi
        const baseLat = dto.lat ?? 38.4189;
        const baseLng = dto.lng ?? 27.1287;
        const queryLabel = dto.query?.trim() || 'Tarihi Nokta';
        const slug = queryLabel
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .slice(0, 24);

        return [
            {
                google_place_id: `ChIJ_mock_${slug}_1`,
                name:
                    lang === 'en'
                        ? `${queryLabel} (Archaeology Museum)`
                        : `${queryLabel} (Arkeoloji Müzesi)`,
                lat: baseLat + 0.002,
                lng: baseLng + 0.002,
                country_code: 'TR',
                city: 'İzmir',
                district: 'Konak',
                types: dto.google_type
                    ? [dto.google_type, 'point_of_interest']
                    : [
                          'museum',
                          'tourist_attraction',
                          'historical_landmark',
                          'point_of_interest',
                      ],
                business_status: 'OPERATIONAL',
                weekday_descriptions: [
                    'Pazartesi: Kapalı',
                    'Salı: 08:30–17:30',
                    'Çarşamba: 08:30–17:30',
                    'Perşembe: 08:30–17:30',
                    'Cuma: 08:30–17:30',
                    'Cumartesi: 08:30–17:30',
                    'Pazar: 08:30–17:30',
                ],
                raw_payload: {
                    source: 'mock_google_places_v1',
                    language: lang,
                    query: dto.query ?? null,
                },
            },
            {
                google_place_id: `ChIJ_mock_${slug}_2`,
                name:
                    lang === 'en'
                        ? `${queryLabel} Artisan Bakery & Cafe`
                        : `${queryLabel} Tarihi Fırın & Kahvaltı`,
                lat: baseLat - 0.003,
                lng: baseLng + 0.004,
                country_code: 'TR',
                city: 'İzmir',
                district: 'Alsancak',
                types: ['bakery', 'cafe', 'restaurant', 'point_of_interest'],
                business_status: 'OPERATIONAL',
                weekday_descriptions: [
                    'Pazartesi: 07:00–22:00',
                    'Salı: 07:00–22:00',
                    'Çarşamba: 07:00–22:00',
                    'Perşembe: 07:00–22:00',
                    'Cuma: 07:00–22:00',
                    'Cumartesi: 07:00–23:00',
                    'Pazar: Kapalı',
                ],
                raw_payload: {
                    source: 'mock_google_places_v1',
                    language: lang,
                    query: dto.query ?? null,
                },
            },
        ];
    }
}
