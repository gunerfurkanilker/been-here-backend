import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export class SearchPlacesQueryDto {
    @IsOptional()
    @IsString()
    q?: string;

    /**
     * Kullanıcıya sunulan iki ayrı arama butonu seçeneği:
     * - NEARBY: "1 - Yakınımdaki Konumları Göster" (lat/lng ve radius bazlı arama)
     * - GLOBAL: "2 - Konum Bağımsız Genel Arama" (tüm veritabanında konum kısıtsız arama)
     */
    @IsOptional()
    @IsIn(['NEARBY', 'GLOBAL'])
    search_mode?: 'NEARBY' | 'GLOBAL' = 'GLOBAL';

    @IsOptional()
    @IsString()
    lang?: string = 'tr';

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-180)
    @Max(180)
    lng?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(100)
    @Max(100000)
    radius?: number = 5000;

    @IsOptional()
    @IsString()
    city?: string;

    @IsOptional()
    @IsString()
    district?: string;

    @IsOptional()
    @IsString()
    country_code?: string;

    @IsOptional()
    @IsIn(['FOOD', 'ACCOMMODATION', 'DESTINATION'])
    ui_category?: string;

    @IsOptional()
    @IsString()
    google_type?: string;

    @IsOptional()
    @IsString()
    vibe?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(50)
    limit?: number = 20;
}

export class NearbyPlacesQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(500)
    @Max(50000)
    radius?: number = 3000;

    @IsOptional()
    @IsString()
    lang?: string = 'tr';

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(50)
    limit?: number = 15;
}

export class FetchGooglePlacesDto {
    /**
     * Google Places API araması için en az 3 karakterli arama metni zorunludur
     * (Tek harfli "A" gibi aramaların binlerce alakasız mekan döndürmesini ve maliyeti önler).
     */
    @IsString()
    @MinLength(3, {
        message:
            'Google Haritalar araması için lütfen en az 3 karakterli bir mekan adı girin.',
    })
    query!: string;

    @IsOptional()
    @IsIn(['NEARBY', 'GLOBAL'])
    search_mode?: 'NEARBY' | 'GLOBAL' = 'GLOBAL';

    @IsOptional()
    @IsString()
    lang?: string = 'tr';

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-90)
    @Max(90)
    lat?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(-180)
    @Max(180)
    lng?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(100)
    @Max(50000)
    radius?: number = 5000;

    @IsOptional()
    @IsString()
    google_type?: string;
}

export class AddPlaceVibesDto {
    @IsArray()
    @IsString({ each: true })
    vibes!: string[];
}

export class AddPlaceWarningsDto {
    @IsArray()
    @IsString({ each: true })
    warnings!: string[];
}

export class CreatePlaceListDto {
    /**
     * Boş bırakılırsa otomatik olarak "Favori Liste 1", "Favori Liste 2" şeklinde adlandırılır.
     */
    @IsOptional()
    @IsString()
    @MaxLength(100)
    title?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    icon?: string;
}

export class AddPlaceToListDto {
    @IsUUID()
    place_id!: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    note?: string;
}

export class PlacesFeedQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number = 10;

    /**
     * Infinite scroll sırasında rastgele keşif sıralamasının sayfa geçişlerinde tutarlı kalması için oturum tohumu (seed).
     */
    @IsOptional()
    @IsString()
    @MaxLength(64)
    seed?: string;
}

export class PlaceRelatedRoutesQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number = 10;
}
