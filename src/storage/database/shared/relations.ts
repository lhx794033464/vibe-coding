import { relations } from "drizzle-orm/relations";
import { customers, schedules } from "./schema";

export const schedulesRelations = relations(schedules, ({one}) => ({
	customer: one(customers, {
		fields: [schedules.customerId],
		references: [customers.id]
	}),
}));

export const customersRelations = relations(customers, ({many}) => ({
	schedules: many(schedules),
}));