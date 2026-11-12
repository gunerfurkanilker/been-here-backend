import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { StayType } from '../../../common/enums';

@Entity('route_stays')
export class RouteStay {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('uuid')
    @Index()
    route_id!: string;

    @Column({
        type: 'enum',
        enum: StayType,
    })
    stay_type!: StayType;

    // Eğer tam konum paylaşılmak istenirse Place ID bağlanır, gizlilik istenirse null kalır
    @Column({ type: 'uuid', nullable: true })
    place_id!: string | null;

    // Örn: "Kaş Merkez", "Fethiye"
    @Column({ type: 'varchar', nullable: true })
    region_name!: string | null;

    // "2 Gece kaldım" (Takvim zorunluluğu yok)
    @Column({ type: 'int', default: 1 })
    nights_count!: number;
}
