import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
} from 'typeorm';
import { RouteStatus } from '../../../common/enums';

@Entity('routes')
export class Route {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('uuid')
    @Index()
    user_id!: string;

    // Eğer başka bir gezginin rotası kopyalandıysa (Forking), orijinal rotanın ID'si
    @Column({ type: 'uuid', nullable: true })
    forked_from_route_id!: string | null;

    @Column({ length: 150 })
    title!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({
        type: 'enum',
        enum: RouteStatus,
        default: RouteStatus.DRAFT,
    })
    @Index()
    status!: RouteStatus;

    // Esnek tarih yapısı: Kesin tarih aralığı veya sadece ay/yıl ("2026-08", "ALL_YEAR")
    @Column({ type: 'date', nullable: true })
    start_date!: Date | null;

    @Column({ type: 'date', nullable: true })
    end_date!: Date | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    flexible_period!: string | null;

    // Çoklu ülke ve şehir seçimi (Örn: ["IT"], ["Roma", "Floransa", "Venedik"])
    @Column({ type: 'jsonb', default: [] })
    countries!: string[];

    @Column({ type: 'jsonb', default: [] })
    cities!: string[];

    // Seyahatin kaç yetişkin ve kaç çocuk ile yapıldığı + toplam kişi ve gün sayısı
    @Column({ type: 'int', default: 1 })
    adults_count!: number;

    @Column({ type: 'int', default: 0 })
    children_count!: number;

    @Column({ type: 'int', default: 1 })
    travelers_count!: number;

    @Column({ type: 'int', default: 1 })
    duration_days!: number;

    // Anasayfa kartı slider'ı için öne çıkarılan maksimum 5 görsel
    @Column({ type: 'jsonb', default: [] })
    featured_media_urls!: string[];

    // Rota oluşturulurken sola kaydırılan (pas geçilen) mekanların ID listesi
    // (Diğer gezgin rotalarında tekrar çıkmaması ve fikrini değiştirirse geri ekleyebilmesi için)
    @Column({ type: 'jsonb', default: [] })
    dismissed_place_ids!: string[];

    // Hızlı Yayınlama Modalı (Smart Expense) bütçe verileri
    @Column({ length: 3, default: 'TRY' })
    currency!: string;

    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    estimated_total_budget!: number | null;

    // Global karşılaştırma ve çoklu döviz gösterimi için USD bazlı karşılık
    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
    estimated_total_budget_usd!: number | null;

    // Kategori bazlı yuvarlak bütçe: { "food": 1500, "activity": 500, "stay": 3000 }
    @Column({ type: 'jsonb', default: {} })
    budget_breakdown!: Record<string, number>;

    // İstatistikler (Gamification çarpanları için)
    @Column({ type: 'int', default: 0 })
    fork_count!: number;

    @Column({ type: 'int', default: 0 })
    swipe_right_count!: number;

    @Column({ type: 'int', default: 0 })
    swipe_left_count!: number;

    @Column({ type: 'boolean', default: false })
    is_boosted!: boolean;

    // Daha önce PUBLISHED olmuş bir rotanın düzenleme için tekrar DRAFT'a çekildiğini (3 + 1 ek kontenjan) izler
    @Column({ type: 'boolean', default: false })
    was_published!: boolean;

    // Rota sahibi bu rota için Soru & Cevap (Q&A) özelliğini kendi profilinden açıp kapatabilir
    @Column({ type: 'boolean', default: true })
    is_qa_enabled!: boolean;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;
}
