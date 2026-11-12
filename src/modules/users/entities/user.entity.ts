import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';
import { SubscriptionTier, GlobalRank } from '../../../common/enums';

export const DEFAULT_BACKPACKER_AVATAR_URL =
    'https://assets.beenhere.app/avatars/default-backpacker-silhouette.png';

export interface ProfileHighlightItem {
    id: string;
    title: string;
    cover_media_url: string;
    media_urls: string[];
    created_at: string;
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ unique: true })
    @Index()
    firebase_uid!: string;

    @Column({ type: 'varchar', unique: true, nullable: true })
    email!: string | null;

    @Column({ unique: true, length: 50 })
    @Index()
    username!: string;

    @Column({ type: 'varchar', nullable: true })
    display_name!: string | null;

    @Column({
        type: 'varchar',
        nullable: true,
        default: DEFAULT_BACKPACKER_AVATAR_URL,
    })
    avatar_url!: string | null;

    /**
     * Maksimum 3 profil fotoğrafı:
     * - 1. fotoğraf (index 0): Ana profil fotoğrafı
     * - 2. ve 3. fotoğraflar (index 1, 2): Profil fotoğrafının üzerine basılı tutulduğunda (Long Press) gösterilen alternatif fotoğraflar.
     * İlk kayıtta varsayılan sırt çantalı gezgin silüetli avatar atanır.
     */
    @Column({
        type: 'jsonb',
        default: [DEFAULT_BACKPACKER_AVATAR_URL],
    })
    avatar_urls!: string[];

    /**
     * Instagram "Highlights" tarzı, rütbenin hemen altında yatay olarak sağa kaydırılan Story fotoğraf dizileri.
     * Kota sınırı yoktur; başka gezginler de profili ziyaret ettiğinde bu dizileri görebilir.
     */
    @Column({ type: 'jsonb', default: [] })
    profile_highlights!: ProfileHighlightItem[];

    @Column({
        type: 'enum',
        enum: SubscriptionTier,
        default: SubscriptionTier.FREE,
    })
    subscription_tier!: SubscriptionTier;

    @Column({ type: 'timestamptz', nullable: true })
    subscription_expires_at!: Date | null;

    // Gamification & Ranking
    @Column({ type: 'int', default: 0 })
    @Index()
    global_points!: number;

    @Column({
        type: 'enum',
        enum: GlobalRank,
        default: GlobalRank.WANDERER,
    })
    global_rank!: GlobalRank;

    // Arka planda çalışan görünmez güven skoru (50'nin altı Keşif Destesi'nde shadowban yer)
    @Column({ type: 'int', default: 100 })
    trust_score!: number;

    // Onboarding sırasında seçilen ilgi alanları: ["#Tarih", "#Doğa", "#YerelLezzet"]
    @Column({ type: 'jsonb', default: [] })
    onboarding_preferences!: string[];

    // Sosyal medya linkleri: { "instagram": "...", "youtube": "..." }
    @Column({ type: 'jsonb', default: {} })
    social_links!: Record<string, string>;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at!: Date;
}
