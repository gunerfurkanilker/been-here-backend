import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    DEFAULT_BACKPACKER_AVATAR_URL,
    ProfileHighlightItem,
    User,
} from './entities/user.entity';
import {
    CreateProfileHighlightDto,
    UpdateProfileDto,
    UpdateProfileHighlightDto,
    UpdateSubscriptionDto,
} from './dto/update-profile.dto';
import { SubscriptionTier } from '../../common/enums';

export interface AuthUserPayload {
    firebase_uid: string;
    email?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    default_tier?: SubscriptionTier;
}

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    async findOrCreateFromAuth(payload: AuthUserPayload): Promise<User> {
        let user = await this.userRepository.findOne({
            where: { firebase_uid: payload.firebase_uid },
        });

        if (user) {
            return user;
        }

        const baseUsername = (
            payload.email?.split('@')[0] ||
            payload.firebase_uid ||
            'traveler'
        )
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '')
            .slice(0, 35);

        const uniqueSuffix = Math.random().toString(36).slice(2, 7);
        const username = `${baseUsername || 'traveler'}_${uniqueSuffix}`;

        const initialAvatar =
            payload.avatar_url ?? DEFAULT_BACKPACKER_AVATAR_URL;

        user = this.userRepository.create({
            firebase_uid: payload.firebase_uid,
            email: payload.email ?? null,
            username,
            display_name: payload.display_name ?? username,
            avatar_url: initialAvatar,
            avatar_urls: [initialAvatar],
            profile_highlights: [],
            subscription_tier: payload.default_tier ?? SubscriptionTier.FREE,
            onboarding_preferences: [],
            social_links: {},
        });

        return this.userRepository.save(user);
    }

    async findById(id: string): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) {
            throw new NotFoundException('Kullanıcı bulunamadı.');
        }
        return user;
    }

    async findByUsername(username: string): Promise<User> {
        const user = await this.userRepository.findOne({ where: { username } });
        if (!user) {
            throw new NotFoundException(`@${username} kullanıcısı bulunamadı.`);
        }
        return user;
    }

    async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
        const user = await this.findById(userId);

        if (dto.username && dto.username !== user.username) {
            const existing = await this.userRepository.findOne({
                where: { username: dto.username },
            });
            if (existing) {
                throw new ConflictException(
                    'Bu kullanıcı adı zaten kullanımda.',
                );
            }
            user.username = dto.username;
        }

        if (dto.display_name !== undefined) {
            user.display_name = dto.display_name;
        }
        if (dto.avatar_urls !== undefined) {
            const cleanedAvatars = dto.avatar_urls
                .map((u) => u.trim())
                .filter(Boolean)
                .slice(0, 3);
            user.avatar_urls =
                cleanedAvatars.length > 0
                    ? cleanedAvatars
                    : [DEFAULT_BACKPACKER_AVATAR_URL];
            user.avatar_url = user.avatar_urls[0];
        } else if (dto.avatar_url !== undefined) {
            user.avatar_url = dto.avatar_url || DEFAULT_BACKPACKER_AVATAR_URL;
            const currentAvatars = Array.isArray(user.avatar_urls)
                ? user.avatar_urls
                : [];
            user.avatar_urls = [
                user.avatar_url,
                ...currentAvatars.slice(1, 3),
            ];
        }
        if (dto.onboarding_preferences !== undefined) {
            user.onboarding_preferences = dto.onboarding_preferences;
        }
        if (dto.social_links !== undefined) {
            user.social_links = dto.social_links;
        }

        return this.userRepository.save(user);
    }

    /**
     * Instagram "Highlights" tarzı Öne Çıkarılan Fotoğraf Dizisi oluşturur (Kota sınırı yoktur).
     */
    async createProfileHighlight(
        userId: string,
        dto: CreateProfileHighlightDto,
    ): Promise<ProfileHighlightItem> {
        const user = await this.findById(userId);
        const mediaUrls = dto.media_urls.map((u) => u.trim()).filter(Boolean);
        const newHighlight: ProfileHighlightItem = {
            id: randomUUID(),
            title: dto.title.trim(),
            cover_media_url: dto.cover_media_url?.trim() || mediaUrls[0] || '',
            media_urls: mediaUrls,
            created_at: new Date().toISOString(),
        };

        const currentHighlights = Array.isArray(user.profile_highlights)
            ? user.profile_highlights
            : [];
        user.profile_highlights = [...currentHighlights, newHighlight];
        await this.userRepository.save(user);
        return newHighlight;
    }

    async updateProfileHighlight(
        userId: string,
        highlightId: string,
        dto: UpdateProfileHighlightDto,
    ): Promise<ProfileHighlightItem> {
        const user = await this.findById(userId);
        const currentHighlights = Array.isArray(user.profile_highlights)
            ? user.profile_highlights
            : [];
        const index = currentHighlights.findIndex((h) => h.id === highlightId);
        if (index === -1) {
            throw new NotFoundException(
                'Öne çıkarılan fotoğraf dizisi bulunamadı.',
            );
        }

        const existing = currentHighlights[index];
        const updatedMediaUrls =
            dto.media_urls !== undefined
                ? dto.media_urls.map((u) => u.trim()).filter(Boolean)
                : existing.media_urls;
        const updated: ProfileHighlightItem = {
            ...existing,
            title: dto.title !== undefined ? dto.title.trim() : existing.title,
            media_urls: updatedMediaUrls,
            cover_media_url:
                dto.cover_media_url !== undefined
                    ? dto.cover_media_url.trim()
                    : existing.cover_media_url || updatedMediaUrls[0] || '',
        };

        currentHighlights[index] = updated;
        user.profile_highlights = [...currentHighlights];
        await this.userRepository.save(user);
        return updated;
    }

    async deleteProfileHighlight(
        userId: string,
        highlightId: string,
    ): Promise<{ deleted: boolean }> {
        const user = await this.findById(userId);
        const currentHighlights = Array.isArray(user.profile_highlights)
            ? user.profile_highlights
            : [];
        const filtered = currentHighlights.filter((h) => h.id !== highlightId);
        if (filtered.length === currentHighlights.length) {
            throw new NotFoundException(
                'Öne çıkarılan fotoğraf dizisi bulunamadı.',
            );
        }

        user.profile_highlights = filtered;
        await this.userRepository.save(user);
        return { deleted: true };
    }

    async updateSubscription(
        userId: string,
        dto: UpdateSubscriptionDto,
    ): Promise<User> {
        const user = await this.findById(userId);
        user.subscription_tier = dto.subscription_tier;
        user.subscription_expires_at = dto.subscription_expires_at
            ? new Date(dto.subscription_expires_at)
            : dto.subscription_tier === SubscriptionTier.PREMIUM
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              : null;
        return this.userRepository.save(user);
    }

    isPremiumActive(user: User): boolean {
        if (user.subscription_tier !== SubscriptionTier.PREMIUM) {
            return false;
        }
        if (!user.subscription_expires_at) {
            return true;
        }
        return new Date(user.subscription_expires_at).getTime() > Date.now();
    }
}
