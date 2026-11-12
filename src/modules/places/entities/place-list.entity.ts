import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';

@Entity('place_lists')
export class PlaceList {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('uuid')
    @Index()
    user_id!: string;

    // Varsayılan öneri: "Favori Liste 1", "Favori Liste 2" veya kullanıcının girdiği özel isim
    @Column({ length: 100 })
    title!: string;

    // Harita üzerinde bayrak (flag) ikonu veya renk kodu (opsiyonel)
    @Column({ type: 'varchar', length: 50, nullable: true })
    icon!: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at!: Date;
}
