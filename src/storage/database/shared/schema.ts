import { pgTable, serial, timestamp, varchar, text, integer, boolean, numeric, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createSchemaFactory } from "drizzle-zod";
import { z } from "zod";

// 系统健康检查表（Supabase 内置，禁止删除）
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 客户状态枚举
export type CustomerStatus = 'not_online' | 'online_not_accepted' | 'accepted' | 'not_going_online' | 'delayed_online' | 'partially_online';

// 客户表
export const customers = pgTable(
  "customers",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    salesOrderNo: varchar("sales_order_no", { length: 100 }),
    implementationOrderNo: varchar("implementation_order_no", { length: 100 }),
    productAmount: integer("product_amount"),
    implementationDays: numeric("implementation_days", { precision: 6, scale: 2 }),
    industry: varchar("industry", { length: 100 }),
    specialRequirements: text("special_requirements"),
    status: varchar("status", { length: 50 }).notNull().default('not_online'),
    lastFollowUpAt: timestamp("last_follow_up_at", { withTimezone: true, mode: 'string' }),
    userId: varchar("user_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("customers_user_id_idx").on(table.userId),
    index("customers_status_idx").on(table.status),
    index("customers_created_at_idx").on(table.createdAt),
  ]
);

// 跟进记录表
export const followUpRecords = pgTable(
  "follow_up_records",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    customerId: varchar("customer_id", { length: 36 }).notNull(),
    followUpAt: timestamp("follow_up_at", { withTimezone: true, mode: 'string' }).notNull(),
    content: text("content").notNull(),
    meetingLink: varchar("meeting_link", { length: 500 }),
    consumedDays: numeric("consumed_days", { precision: 6, scale: 2 }),
    isAccepted: boolean("is_accepted").default(false).notNull(),
    signatureImageUrl: varchar("signature_image_url", { length: 500 }),
    userId: varchar("user_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("follow_up_records_customer_id_idx").on(table.customerId),
    index("follow_up_records_user_id_idx").on(table.userId),
    index("follow_up_records_follow_up_at_idx").on(table.followUpAt),
  ]
);

// 使用 createSchemaFactory 配置 date coercion
const { createInsertSchema: createCoercedInsertSchema } = createSchemaFactory({
  coerce: { date: true },
});

// 客户 Zod schemas
export const insertCustomerSchema = createCoercedInsertSchema(customers).pick({
  name: true,
  salesOrderNo: true,
  implementationOrderNo: true,
  productAmount: true,
  implementationDays: true,
  industry: true,
  specialRequirements: true,
  status: true,
  userId: true,
});

export const updateCustomerSchema = createCoercedInsertSchema(customers)
  .pick({
    name: true,
    salesOrderNo: true,
    implementationOrderNo: true,
    productAmount: true,
    implementationDays: true,
    industry: true,
    specialRequirements: true,
    status: true,
    lastFollowUpAt: true,
  })
  .partial();

// 跟进记录 Zod schemas
export const insertFollowUpRecordSchema = createCoercedInsertSchema(followUpRecords).pick({
  customerId: true,
  followUpAt: true,
  content: true,
  meetingLink: true,
  consumedDays: true,
  isAccepted: true,
  signatureImageUrl: true,
  userId: true,
});

// TypeScript types
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;
export type FollowUpRecord = typeof followUpRecords.$inferSelect;
export type InsertFollowUpRecord = z.infer<typeof insertFollowUpRecordSchema>;
