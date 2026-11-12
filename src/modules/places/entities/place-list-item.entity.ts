import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
    Unique,
} from 'typeorm';

@Entity('place_list_items')
@Unique('UQ_PLACE_LIST_ITEM', ['list_id', 'place_id'])
export class PlaceListItem {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('uuid')
    @Index()
    list_id!: string;

    @Column('uuid')
    @Index()
    user_id!: string;

    @Column('uuid')
    @Index()
    place_id!: string;

    // Kullanıcının bu mekanı listeye eklerken aldığı kısa not (opsiyonel)
    @Column({ type: 'text', nullable: true })
    note!: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;
}
