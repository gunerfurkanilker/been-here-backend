import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('route_questions')
export class RouteQuestion {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'uuid' })
    @Index()
    route_id!: string;

    @Column({ type: 'uuid' })
    @Index()
    route_owner_id!: string;

    @Column({ type: 'uuid' })
    @Index()
    asker_user_id!: string;

    @Column({ type: 'text' })
    question_text!: string;

    @Column({ type: 'text', nullable: true })
    answer_text!: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    answered_at!: Date | null;

    @CreateDateColumn({ type: 'timestamptz' })
    created_at!: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updated_at!: Date;
}
