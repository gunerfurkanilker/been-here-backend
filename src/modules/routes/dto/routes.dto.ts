import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsDateString,
    IsEnum,
    IsIn,
    IsInt,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator';
import {
    RouteStatus,
    StayType,
    VerificationType,
} from '../../../common/enums';

export class CreateRouteStopInputDto {
    @IsUUID()
    place_id!: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    order_index?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    day_number?: number;

    @IsOptional()
    @IsEnum(VerificationType)
    verification_type?: VerificationType;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(5)
    rating?: number;

    @IsOptional()
    @IsString()
    comment?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    selected_vibes?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    selected_warnings?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    media_urls?: string[];
}

export class CreateRouteStayInputDto {
    @IsEnum(StayType)
    stay_type!: StayType;

    @IsOptional()
    @IsUUID()
    place_id?: string;

    @IsOptional()
    @IsString()
    region_name?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    nights_count?: number = 1;
}

export class CreateRouteDto {
    @IsString()
    @MaxLength(150)
    title!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    start_date?: string;

    @IsOptional()
    @IsString()
    end_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    flexible_period?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    countries?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    cities?: string[];

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    adults_count?: number = 1;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    children_count?: number = 0;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    travelers_count?: number = 1;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(365)
    duration_days?: number = 1;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(5)
    @IsString({ each: true })
    featured_media_urls?: string[];

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currency?: string = 'TRY';

    @IsOptional()
    @IsNumber()
    @Min(0)
    estimated_total_budget?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    estimated_total_budget_usd?: number;

    @IsOptional()
    @IsObject()
    budget_breakdown?: Record<string, number>;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateRouteStopInputDto)
    stops?: CreateRouteStopInputDto[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateRouteStayInputDto)
    stays?: CreateRouteStayInputDto[];
}

export class UpdateRouteStopDto {
    @IsOptional()
    @IsInt()
    @Min(0)
    order_index?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    day_number?: number;

    @IsOptional()
    @IsEnum(VerificationType)
    verification_type?: VerificationType;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(5)
    rating?: number;

    @IsOptional()
    @IsString()
    comment?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    selected_vibes?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    selected_warnings?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    media_urls?: string[];
}

export class UpdateRouteDto {
    @IsOptional()
    @IsString()
    @MaxLength(150)
    title?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsString()
    start_date?: string;

    @IsOptional()
    @IsString()
    end_date?: string;

    @IsOptional()
    @IsString()
    @MaxLength(20)
    flexible_period?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    countries?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    cities?: string[];

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    adults_count?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    children_count?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    travelers_count?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(365)
    duration_days?: number;

    @IsOptional()
    @IsArray()
    @ArrayMaxSize(5)
    @IsString({ each: true })
    featured_media_urls?: string[];

    @IsOptional()
    @IsString()
    @MaxLength(3)
    currency?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    estimated_total_budget?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    estimated_total_budget_usd?: number;

    @IsOptional()
    @IsObject()
    budget_breakdown?: Record<string, number>;
}

export class PublishRouteStopFeedbackDto {
    @IsUUID()
    stop_id!: string;

    @IsInt()
    @Min(1)
    @Max(5)
    rating!: number;

    @IsOptional()
    @IsString()
    comment?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    selected_vibes?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    selected_warnings?: string[];
}

export class PublishRouteDto {
    @IsOptional()
    @IsString()
    @MaxLength(3)
    currency?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    estimated_total_budget?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    estimated_total_budget_usd?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    travelers_count?: number;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(365)
    duration_days?: number;

    /**
     * Anasayfa kartındaki slider için öne çıkarılan maksimum 5 görsel.
     * Boş bırakılırsa duraklardaki ilk 5 fotoğraf otomatik olarak seçilir.
     */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(5)
    @IsString({ each: true })
    featured_media_urls?: string[];

    @IsOptional()
    @IsObject()
    budget_breakdown?: Record<string, number>;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PublishRouteStopFeedbackDto)
    stop_feedbacks?: PublishRouteStopFeedbackDto[];

    /**
     * Yayınlama (Publish) esnasında tek ekrandan konaklama bilgilerini (Bungalov, Otel vb.) kaydetmek için.
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateRouteStayInputDto)
    stays?: CreateRouteStayInputDto[];
}

export class ForkRouteDto {
    /**
     * Başka gezginin rotasından sağa kaydırılarak seçilen mekanların ekleneceği,
     * kullanıcının kendi mevcut taslak (DRAFT) rotasının ID'si.
     */
    @IsUUID()
    target_route_id!: string;

    /**
     * Swipe Right ile seçilen kaynak rota duraklarının (RouteStop) ID listesi.
     * Komple rota kopyalanmaz; yalnızca sağa kaydırılan duraklar kullanıcının kendi rotasına çekilir.
     */
    @IsArray()
    @ArrayMinSize(1)
    @IsUUID('4', { each: true })
    selected_stop_ids!: string[];

    @IsOptional()
    @IsInt()
    @Min(1)
    day_number?: number;
}

export class DiscoveryDeckQueryDto {
    @IsOptional()
    @IsIn(['ROUTES', 'PLACES'])
    mode?: 'ROUTES' | 'PLACES' = 'ROUTES';

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    lat?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    lng?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    radius?: number = 15000;

    @IsOptional()
    @IsIn([
        'GLOBAL',
        'EUROPE',
        'ASIA',
        'NORTH_AMERICA',
        'SOUTH_AMERICA',
        'AFRICA',
        'OCEANIA',
    ])
    continent?:
        | 'GLOBAL'
        | 'EUROPE'
        | 'ASIA'
        | 'NORTH_AMERICA'
        | 'SOUTH_AMERICA'
        | 'AFRICA'
        | 'OCEANIA' = 'GLOBAL';

    /**
     * Anasayfa akışı için Kıta > Ülke çoklu ülke seçimi (Örn: "Almanya,Fransa,Belçika" veya "DE,FR,BE" veya "ALL").
     */
    @IsOptional()
    @IsString()
    countries?: string;

    @IsOptional()
    @IsString()
    city?: string;

    /**
     * Çoklu şehir seçimiyle filtreleme için virgülle ayrılmış şehir listesi (Örn: "Roma,Floransa,Venedik").
     */
    @IsOptional()
    @IsString()
    cities?: string;

    @IsOptional()
    @IsIn(['FOOD', 'ACCOMMODATION', 'DESTINATION'])
    ui_category?: string;

    @IsOptional()
    @IsString()
    vibe?: string;

    @IsOptional()
    @IsString()
    elite_only?: string; // 'true' | 'false'

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    max_budget?: number;

    @IsOptional()
    @IsString()
    flexible_period?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(50)
    limit?: number = 20;

    /**
     * Aktif taslak rotanın ID'si gönderilirse, o rotaya zaten eklenmiş veya
     * sola kaydırılmış (dismissed) mekanlar Keşif Destesi'nde tekrar gösterilmez.
     */
    @IsOptional()
    @IsUUID()
    exclude_for_route_id?: string;
}

export class DismissPlaceInRouteDto {
    @IsUUID()
    place_id!: string;
}

export class RestoreDismissedPlaceDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    day_number?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    order_index?: number;
}

export class SwipeRouteDto {
    @IsIn(['RIGHT', 'LEFT'])
    direction!: 'RIGHT' | 'LEFT';
}

export class ExifPhotoMetadataItemDto {
    @IsString()
    photo_local_id!: string;

    @IsDateString()
    timestamp!: string;

    @IsOptional()
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat?: number;

    @IsOptional()
    @IsNumber()
    @Min(-180)
    @Max(180)
    lng?: number;
}

export class MatchExifRequestDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ExifPhotoMetadataItemDto)
    photos!: ExifPhotoMetadataItemDto[];

    @IsOptional()
    @IsUUID()
    active_route_id?: string;

    @IsOptional()
    @IsNumber()
    @Min(20)
    @Max(2000)
    match_radius_meters?: number = 250;
}

export class GeofenceVisitItemDto {
    @IsUUID()
    place_id!: string;

    @IsDateString()
    visited_at!: string;

    @IsOptional()
    @IsString()
    comment?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    media_urls?: string[];

    @IsOptional()
    @IsInt()
    @Min(1)
    day_number?: number;
}

export class BatchGeofenceSyncDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => GeofenceVisitItemDto)
    visits!: GeofenceVisitItemDto[];

    /**
     * Manifesto 5.2.4: Mevcut bir rotanın bugünkü gününe durak olarak ekleme.
     * Boş bırakılırsa otomatik olarak yeni bir PRIVATE_MEMORY (Kişisel Anı Rotası) oluşturur.
     */
    @IsOptional()
    @IsUUID()
    target_route_id?: string;

    @IsOptional()
    @IsString()
    @MaxLength(150)
    title?: string;
}

export class UserRoutesFilterQueryDto {
    @IsOptional()
    @IsEnum(RouteStatus)
    status?: RouteStatus;

    /**
     * Paylaşılan Rotalar (PUBLISHED) ve Kişisel Anılarım (PRIVATE_MEMORY) sekmelerinde ülke bazlı filtreleme.
     */
    @IsOptional()
    @IsString()
    country?: string;

    /**
     * Şehir bazlı filtreleme.
     */
    @IsOptional()
    @IsString()
    city?: string;

    /**
     * Tarih aralığı başlangıç filtresi (ISO Date).
     */
    @IsOptional()
    @IsDateString()
    start_date?: string;

    /**
     * Tarih aralığı bitiş filtresi (ISO Date).
     */
    @IsOptional()
    @IsDateString()
    end_date?: string;

    /**
     * Yıl bazlı hızlı tarih filtresi (Örn: 2025, 2026).
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1990)
    @Max(2100)
    year?: number;
}

export class CreateRouteQuestionDto {
    @IsString()
    @MinLength(3)
    @MaxLength(1000)
    question_text!: string;
}

export class AnswerRouteQuestionDto {
    @IsString()
    @MinLength(1)
    @MaxLength(2000)
    answer_text!: string;
}

export class UpdateRouteQaSettingsDto {
    @IsBoolean()
    is_qa_enabled!: boolean;
}

export class UserQuestionsQueryDto {
    @IsOptional()
    @IsIn(['ALL', 'UNANSWERED', 'ANSWERED'])
    status?: 'ALL' | 'UNANSWERED' | 'ANSWERED' = 'ALL';

    @IsOptional()
    @IsUUID()
    route_id?: string;
}
