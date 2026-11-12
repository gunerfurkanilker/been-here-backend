import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    Unique,
    UpdateDateColumn,
} from 'typeorm';

@Entity('user_regional_scores')
@Unique(['user_id', 'country_code', 'city'])
export class UserRegionalScore {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    @Index()
    user_id!: string;

    @Column({ type: 'varchar', length: 30 })
    @Index()
    continent!: string;

    @Column({ type: 'varchar', length: 10 })
    @Index()
    country_code!: string;

    @Column({ type: 'varchar', length: 100, default: 'GENERAL' })
    @Index()
    city!: string;

    @Column({ type: 'int', default: 0 })
    @Index()
    points!: number;

    @Column({ type: 'int', default: 0 })
    verified_visits_count!: number;

    @Column({ type: 'int', default: 0 })
    published_routes_count!: number;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at!: Date;
}
