import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEnum,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';
import { SubscriptionTier } from '../../../common/enums';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(50)
    username?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    display_name?: string;

    @IsOptional()
    @IsString()
    avatar_url?: string;

    /**
     * Maksimum 3 adet profil fotoğrafı:
     * 1. foto ana fotoğraf, diğer 2 foto profil fotoğrafına basılı tutulduğunda (long-press) açılan alternatiflerdir.
     */
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(3)
    @IsString({ each: true })
    avatar_urls?: string[];

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    onboarding_preferences?: string[];

    @IsOptional()
    @IsObject()
    social_links?: Record<string, string>;
}

export class CreateProfileHighlightDto {
    @IsString()
    @MinLength(1)
    @MaxLength(60)
    title!: string;

    @IsOptional()
    @IsString()
    cover_media_url?: string;

    /**
     * Kullanıcının rotalarına yüklediği fotoğraflardan oluşturduğu "Öne Çıkarılan" fotoğraf dizisi (Kota sınırı yoktur).
     */
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    media_urls!: string[];
}

export class UpdateProfileHighlightDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(60)
    title?: string;

    @IsOptional()
    @IsString()
    cover_media_url?: string;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    media_urls?: string[];
}

export class UpdateSubscriptionDto {
    @IsEnum(SubscriptionTier)
    subscription_tier!: SubscriptionTier;

    @IsOptional()
    @IsString()
    subscription_expires_at?: string;
}
