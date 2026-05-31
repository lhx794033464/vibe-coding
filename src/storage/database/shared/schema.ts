import { pgTable, index, varchar, timestamp, text, boolean, numeric, serial, integer, uniqueIndex, pgPolicy, foreignKey, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const gen_random_uuid = () => sql`gen_random_uuid()`;

export const users = pgTable("users", {
  id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
  username: varchar({ length: 100 }).notNull(),
  email: varchar({ length: 255 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar({ length: 20 }).default('user').notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
  uniqueIndex("users_username_key").on(table.username),
  index("users_role_idx").on(table.role),
]);

export const followUpRecords = pgTable("follow_up_records", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	customerId: varchar("customer_id", { length: 36 }).notNull(),
	followUpAt: timestamp("follow_up_at", { withTimezone: true, mode: 'string' }).notNull(),
	content: text().notNull(),
	meetingLink: varchar("meeting_link", { length: 500 }),
	isAccepted: boolean("is_accepted").default(false).notNull(),
	signatureImageUrl: varchar("signature_image_url", { length: 500 }),
	userId: varchar("user_id", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	consumedDays: numeric("consumed_days", { precision: 6, scale:  2 }),
}, (table) => [
	index("follow_up_records_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("text_ops")),
	index("follow_up_records_follow_up_at_idx").using("btree", table.followUpAt.asc().nullsLast().op("timestamptz_ops")),
	index("follow_up_records_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const customers = pgTable("customers", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	salesOrderNo: varchar("sales_order_no", { length: 100 }),
	implementationOrderNo: varchar("implementation_order_no", { length: 100 }),
	productAmount: integer("product_amount"),
	implementationDays: numeric("implementation_days", { precision: 6, scale:  2 }),
	industry: varchar({ length: 100 }),
	specialRequirements: text("special_requirements"),
	status: varchar({ length: 50 }).default('not_online').notNull(),
	acceptanceStatus: varchar("acceptance_status", { length: 50 }).default('not_accepted'),
	lastFollowUpAt: timestamp("last_follow_up_at", { withTimezone: true, mode: 'string' }),
	userId: varchar("user_id", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	version: varchar({ length: 50 }),
	modules: text().array(),
	implementationFee: integer("implementation_fee"),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }),
	onlineAt: timestamp("online_at", { withTimezone: true, mode: 'string' }),
	acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: 'string' }),
	nextCommissionMonth: varchar("next_commission_month", { length: 7 }),
}, (table) => [
	index("customers_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("customers_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("customers_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const userProfiles = pgTable("user_profiles", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	avatarUrl: varchar("avatar_url", { length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
	userId: varchar("user_id", { length: 36 }),
}, (table) => [
	uniqueIndex("user_profiles_user_id_key").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	pgPolicy("Users can update own profile", { as: "permissive", for: "update", to: ["public"], using: sql`((auth.uid())::text = (id)::text)` }),
	pgPolicy("Users can insert own profile", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can view own profile", { as: "permissive", for: "select", to: ["public"] }),
]);

export const todos = pgTable("todos", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	content: text().notNull(),
	customerId: varchar("customer_id", { length: 36 }),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }).notNull(),
	priority: varchar({ length: 20 }).default('low').notNull(),
	completed: boolean().default(false).notNull(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	userId: varchar("user_id", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("todos_completed_idx").using("btree", table.completed.asc().nullsLast().op("bool_ops")),
	index("todos_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("text_ops")),
	index("todos_due_date_idx").using("btree", table.dueDate.asc().nullsLast().op("timestamptz_ops")),
	index("todos_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const schedules = pgTable("schedules", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	customerId: varchar("customer_id", { length: 36 }).notNull(),
	scheduleDate: date("schedule_date").notNull(),
	notes: text(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("schedules_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("text_ops")),
	index("schedules_schedule_date_idx").using("btree", table.scheduleDate.asc().nullsLast().op("date_ops")),
	index("schedules_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "schedules_customer_id_fkey"
		}).onDelete("cascade"),
]);

export const commissionRecords = pgTable("commission_records", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	customerId: varchar("customer_id", { length: 36 }).notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	totalCommission: numeric("total_commission", { precision: 10, scale:  2 }).notNull(),
	paidCommission: numeric("paid_commission", { precision: 10, scale:  2 }).default('0').notNull(),
	remark: text(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	financeDays: numeric("finance_days", { precision: 6, scale:  2 }),
	otherDays: numeric("other_days", { precision: 6, scale:  2 }),
}, (table) => [
	index("commission_records_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("text_ops")),
	index("commission_records_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const implementationLogs = pgTable("implementation_logs", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	customerId: varchar("customer_id", { length: 36 }).notNull(),
	logDate: timestamp("log_date", { withTimezone: true, mode: 'string' }).notNull(),
	consumedDays: numeric("consumed_days", { precision: 6, scale:  2 }).notNull(),
	summary: text().notNull(),
	meetingLink: varchar("meeting_link", { length: 500 }),
	userId: varchar("user_id", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("implementation_logs_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("text_ops")),
	index("implementation_logs_log_date_idx").using("btree", table.logDate.asc().nullsLast().op("timestamptz_ops")),
	index("implementation_logs_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);
