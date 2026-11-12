import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';
import type { Point } from 'geojson';
import { PlaceStatus } from '../../../common/enums';

@Entity('places')
export class Place {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    // Evrensel tekillik kalkanı: Aynı mekan farklı dilde aransa bile asla mükerrer kaydedilmez
    @Column({ unique: true })
    @Index()
    google_place_id!: string;

    // DB'ye ilk kaydedildiği dildeki varsayılan isim (Fallback)
    @Column()
    default_name!: string;

    // Çoklu dil sözlüğü: { "tr": "Saat Kulesi", "en": "Clock Tower", "de": "Uhrturm" }
    @Column({ type: 'jsonb', default: {} })
    @Index('IDX_PLACE_NAME_TRANSLATIONS', { synchronize: false })
    name_translations!: Record<string, string>;

    // PostGIS Coğrafi Konum Sütunu (Metre bazlı ST_DWithin sorguları için geography tipi)
    @Column({
        type: 'geography',
        spatialFeatureType: 'Point',
        srid: 4326,
    })
    @Index({ spatial: true })
    location!: Point;

    @Column({ type: 'varchar', nullable: true })
    country_code!: string | null; // Örn: 'TR', 'IT'

    @Column({ type: 'varchar', nullable: true })
    @Index()
    city!: string | null; // Örn: 'İzmir'

    @Column({ type: 'varchar', nullable: true })
    district!: string | null; // Örn: 'Konak'

    // Google'dan gelen esnek etiketler: ["restaurant", "bakery", "point_of_interest"]
    @Column({ type: 'jsonb', default: [] })
    google_types!: string[];

    // Sunum katmanı (UI) ana kategorisi: 'FOOD' | 'ACCOMMODATION' | 'DESTINATION'
    @Column({ length: 30, default: 'DESTINATION' })
    @Index()
    ui_category!: string;

    // Topluluk tarafından verilen Vibe etiketleri ve oy sayıları: { "Gün Batımı": 42, "Sessiz": 15 }
    @Column({ type: 'jsonb', default: {} })
    community_vibes!: Record<string, number>;

    // Topluluk tarafından verilen Saha Uyarıları ve oy sayıları: { "Yüksek UV / Gölgesiz": 34, "Dik Tırmanış": 18 }
    @Column({ type: 'jsonb', default: {} })
    community_warnings!: Record<string, number>;

    // Sadece GEO_VERIFIED ve PHOTO_VERIFIED ziyaretlerle artan manipüle edilemez popülerlik puanı
    @Column({ type: 'int', default: 0 })
    @Index()
    verified_hype_score!: number;

    @Column({
        type: 'enum',
        enum: PlaceStatus,
        default: PlaceStatus.ACTIVE,
    })
    status!: PlaceStatus;

    // Çalışma günleri, saatleri ve kapalı olduğu günler:
    // { "weekday_descriptions": ["Pazartesi: Kapalı", "Salı: 08:30–17:30"], "closed_days": ["Pazartesi"] }
    @Column({ type: 'jsonb', nullable: true })
    opening_hours!: {
        weekday_descriptions?: string[];
        closed_days?: string[];
    } | null;

    // Google Places API'den dönen ham veri
    @Column({ type: 'jsonb', nullable: true })
    raw_google_payload!: Record<string, unknown> | null;

    // 30 Günlük Lazy Refresh kontrolü için son senkronizasyon tarihi
    @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    last_synced_at!: Date;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at!: Date;
}
