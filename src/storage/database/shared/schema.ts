import { pgTable, serial, timestamp, varchar, text, integer, boolean, numeric, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createSchemaFactory } from "drizzle-zod";
import { z } from "zod";

// 系统健康检查表（Supabase 内置，禁止删除）
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 使用 createSchemaFactory 配置 date coercion
const { createInsertSchema: createCoercedInsertSchema } = createSchemaFactory({
  coerce: { date: true },
});

// 用户表
export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    username: varchar("username", { length: 100 }).notNull().unique(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    password_hash: varchar("password_hash", { length: 255 }),
    role: varchar("role", { length: 20 }).notNull().default('user'), // admin | user
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("users_username_idx").on(table.username),
    index("users_role_idx").on(table.role),
    index("users_is_active_idx").on(table.is_active),
  ]
);

// 用户表 Zod schemas
export const insertUserSchema = createCoercedInsertSchema(users).pick({
  username: true,
  email: true,
  role: true,
  is_active: true,
});

export const updateUserSchema = createCoercedInsertSchema(users)
  .pick({
    username: true,
    email: true,
    role: true,
    is_active: true,
  })
  .partial();

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;

// 客户状态枚举
export type CustomerStatus = 'not_online' | 'online_not_accepted' | 'accepted' | 'not_going_online' | 'delayed_online' | 'partially_online';

// 产品版本枚举
export type ProductVersion = 'standard' | 'professional' | 'flagship';

// 产品模块
export type ProductModule = 'finance' | 'inventory' | 'production' | 'reimbursement' | 'tax' | 'invoicing' | 'ordering' | 'retail' | 'outsourcing';

// 版本配置
export const VERSION_CONFIG: Record<ProductVersion, { label: string; color: string }> = {
  standard: { label: '标准版', color: 'bg-blue-100 text-blue-700' },
  professional: { label: '专业版', color: 'bg-purple-100 text-purple-700' },
  flagship: { label: '旗舰版', color: 'bg-amber-100 text-amber-700' },
};

// 模块配置
export const MODULE_CONFIG: Record<ProductModule, { label: string }> = {
  finance: { label: '财务' },
  inventory: { label: '进销存' },
  production: { label: '生产' },
  reimbursement: { label: '报销' },
  tax: { label: '纳税' },
  invoicing: { label: '开票' },
  ordering: { label: '订货' },
  retail: { label: '零售' },
  outsourcing: { label: '委外' },
};

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
    implementationFee: integer("implementation_fee"),
    implementationDays: numeric("implementation_days", { precision: 6, scale: 2 }),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }),
    onlineAt: timestamp("online_at", { withTimezone: true, mode: 'string' }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: 'string' }),
    version: varchar("version", { length: 50 }),
    modules: text("modules").array(),
    industry: varchar("industry", { length: 100 }),
    specialRequirements: text("special_requirements"),
    status: varchar("status", { length: 50 }).notNull().default('not_online'),
    lastFollowUpAt: timestamp("last_follow_up_at", { withTimezone: true, mode: 'string' }),
    nextCommissionMonth: varchar("next_commission_month", { length: 7 }), // 下次计提月份 yyyy-MM
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

// 客户 Zod schemas
export const insertCustomerSchema = createCoercedInsertSchema(customers).pick({
  name: true,
  salesOrderNo: true,
  implementationOrderNo: true,
  implementationFee: true,
  implementationDays: true,
  openedAt: true,
  version: true,
  modules: true,
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
    implementationFee: true,
    implementationDays: true,
    openedAt: true,
    version: true,
    modules: true,
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

// 提成记录表
export const commissionRecords = pgTable(
  "commission_records",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    customerId: varchar("customer_id", { length: 36 }).notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    totalCommission: numeric("total_commission", { precision: 10, scale: 2 }).notNull(), // 应提总额
    paidCommission: numeric("paid_commission", { precision: 10, scale: 2 }).notNull().default('0'), // 已提金额
    financeDays: numeric("finance_days", { precision: 6, scale: 2 }), // 财务模块人天
    otherDays: numeric("other_days", { precision: 6, scale: 2 }), // 其他模块人天
    remark: text("remark"),
    userId: varchar("user_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("commission_records_customer_id_idx").on(table.customerId),
    index("commission_records_user_id_idx").on(table.userId),
  ]
);

// 提成记录 Zod schemas
export const insertCommissionRecordSchema = createCoercedInsertSchema(commissionRecords).pick({
  customerId: true,
  amount: true,
  totalCommission: true,
  paidCommission: true,
  remark: true,
  userId: true,
});

export type CommissionRecord = typeof commissionRecords.$inferSelect;
export type InsertCommissionRecord = z.infer<typeof insertCommissionRecordSchema>;

// 用户配置表
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: varchar("id", { length: 36 })
      .primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull().unique(), // Supabase auth user id
    avatarUrl: varchar("avatar_url", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  }
);

// 用户配置 Zod schemas
export const insertUserProfileSchema = createCoercedInsertSchema(userProfiles).pick({
  id: true,
  userId: true,
  avatarUrl: true,
});

export const updateUserProfileSchema = createCoercedInsertSchema(userProfiles)
  .pick({
    avatarUrl: true,
  })
  .partial();

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;

// 待办优先级枚举
export type TodoPriority = 'high' | 'medium' | 'low';

// 优先级配置
export const PRIORITY_CONFIG: Record<TodoPriority, { label: string; color: string; order: number }> = {
  high: { label: '重要', color: 'bg-red-100 text-red-700 border-red-200', order: 3 },
  medium: { label: '次要', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', order: 2 },
  low: { label: '常规', color: 'bg-gray-100 text-gray-600 border-gray-200', order: 1 },
};

// 待办事项表
export const todos = pgTable(
  "todos",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    content: text("content").notNull(),
    customerId: varchar("customer_id", { length: 36 }),
    dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }).notNull(),
    priority: varchar("priority", { length: 20 }).notNull().default('low'),
    completed: boolean("completed").default(false).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
    userId: varchar("user_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("todos_user_id_idx").on(table.userId),
    index("todos_due_date_idx").on(table.dueDate),
    index("todos_completed_idx").on(table.completed),
    index("todos_customer_id_idx").on(table.customerId),
  ]
);

// 待办事项 Zod schemas
export const insertTodoSchema = createCoercedInsertSchema(todos).pick({
  content: true,
  customerId: true,
  dueDate: true,
  priority: true,
  userId: true,
});

export const updateTodoSchema = createCoercedInsertSchema(todos)
  .pick({
    content: true,
    customerId: true,
    dueDate: true,
    priority: true,
    completed: true,
    completedAt: true,
  })
  .partial();

export type Todo = typeof todos.$inferSelect;
export type InsertTodo = z.infer<typeof insertTodoSchema>;
export type UpdateTodo = z.infer<typeof updateTodoSchema>;

// 日程排期表
export const schedules = pgTable(
  "schedules",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    customerId: varchar("customer_id", { length: 36 }).notNull(),
    scheduleDate: timestamp("schedule_date", { withTimezone: true, mode: 'string' }).notNull(),
    notes: text("notes"),
    userId: varchar("user_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("schedules_user_id_idx").on(table.userId),
    index("schedules_schedule_date_idx").on(table.scheduleDate),
    index("schedules_customer_id_idx").on(table.customerId),
  ]
);

// 日程排期 Zod schemas
export const insertScheduleSchema = createCoercedInsertSchema(schedules).pick({
  customerId: true,
  scheduleDate: true,
  notes: true,
  userId: true,
});

export const updateScheduleSchema = createCoercedInsertSchema(schedules)
  .pick({
    customerId: true,
    scheduleDate: true,
    notes: true,
  })
  .partial();

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type UpdateSchedule = z.infer<typeof updateScheduleSchema>;

// 实施日志表
export const implementationLogs = pgTable(
  "implementation_logs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    customerId: varchar("customer_id", { length: 36 }).notNull(),
    logDate: timestamp("log_date", { withTimezone: true, mode: 'string' }).notNull(),
    consumedDays: numeric("consumed_days", { precision: 6, scale: 2 }).notNull(),
    summary: text("summary").notNull(),
    meetingLink: varchar("meeting_link", { length: 500 }),
    userId: varchar("user_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("implementation_logs_user_id_idx").on(table.userId),
    index("implementation_logs_customer_id_idx").on(table.customerId),
    index("implementation_logs_log_date_idx").on(table.logDate),
  ]
);

// 实施日志 Zod schemas
export const insertImplementationLogSchema = createCoercedInsertSchema(implementationLogs).pick({
  customerId: true,
  logDate: true,
  consumedDays: true,
  summary: true,
  meetingLink: true,
  userId: true,
});

export const updateImplementationLogSchema = createCoercedInsertSchema(implementationLogs)
  .pick({
    logDate: true,
    consumedDays: true,
    summary: true,
    meetingLink: true,
  })
  .partial();

export type ImplementationLog = typeof implementationLogs.$inferSelect;
export type InsertImplementationLog = z.infer<typeof insertImplementationLogSchema>;
export type UpdateImplementationLog = z.infer<typeof updateImplementationLogSchema>;
