import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { VerificationType } from '../../../common/enums';

@Entity('route_stops')
export class RouteStop {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('uuid')
    @Index()
    route_id!: string;

    @Column('uuid')
    @Index()
    place_id!: string;

    // Bu durak başka bir gezginin rotasından çekildiyse (Forking), kaynak rotanın ID'si
    @Column({ type: 'uuid', nullable: true })
    forked_from_route_id!: string | null;

    @Column({ type: 'int', default: 0 })
    order_index!: number;

    // Opsiyonel: Kullanıcı gün gün ayırmak isterse
    @Column({ type: 'int', nullable: true })
    day_number!: number | null;

    @Column({
        type: 'enum',
        enum: VerificationType,
        default: VerificationType.MANUAL,
    })
    verification_type!: VerificationType;

    // 1 - 5 arası yıldız (Yayınlamak için zorunlu)
    @Column({ type: 'smallint', nullable: true })
    rating!: number | null;

    @Column({ type: 'text', nullable: true })
    comment!: string | null;

    // Kullanıcının bu durak için seçtiği Vibe etiketleri: ["Gün Batımı", "Yerel Lezzet"]
    @Column({ type: 'jsonb', default: [] })
    selected_vibes!: string[];

    // Kullanıcının bu durak için seçtiği Saha Uyarıları: ["Yüksek UV / Gölgesiz", "Dik Tırmanış"]
    @Column({ type: 'jsonb', default: [] })
    selected_warnings!: string[];

    // Cloudflare R2 medya linkleri (Free: max 2 foto, Premium: sınırsız foto + kısa video)
    @Column({ type: 'jsonb', default: [] })
    media_urls!: string[];
}
