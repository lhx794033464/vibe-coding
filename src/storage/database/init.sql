-- 用户表初始化脚本
-- PostgreSQL / Supabase 数据库初始化

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_is_active_idx ON users(is_active);

-- 插入默认管理员用户（如果不存在）
-- 注意：password_hash 应使用 bcrypt 哈希，此处占位值需由应用启动时的 ensureAdminUser 函数覆盖
-- 如需手动设置，请使用 Node.js: require('bcryptjs').hashSync('你的密码', 12)
INSERT INTO users (username, email, password_hash, role, is_active)
SELECT 'admin', 'admin@company.com', '$2a$12$placeholder.use.ensureAdminUser', 'admin', true
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'admin'
);

-- 客户表（如果需要）
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  sales_order_no VARCHAR(100),
  implementation_order_no VARCHAR(100),
  implementation_fee INTEGER,
  implementation_days NUMERIC(6,2),
  opened_at TIMESTAMP WITH TIME ZONE,
  online_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  version VARCHAR(50),
  modules TEXT[],
  industry VARCHAR(100),
  special_requirements TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'not_online',
  last_follow_up_at TIMESTAMP WITH TIME ZONE,
  next_commission_month VARCHAR(7),
  user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS customers_user_id_idx ON customers(user_id);
CREATE INDEX IF NOT EXISTS customers_status_idx ON customers(status);
CREATE INDEX IF NOT EXISTS customers_created_at_idx ON customers(created_at);

-- 跟进记录表
CREATE TABLE IF NOT EXISTS follow_up_records (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id VARCHAR(36) NOT NULL,
  follow_up_at TIMESTAMP WITH TIME ZONE NOT NULL,
  content TEXT NOT NULL,
  meeting_link VARCHAR(500),
  consumed_days NUMERIC(6,2),
  is_accepted BOOLEAN DEFAULT false NOT NULL,
  signature_image_url VARCHAR(500),
  user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS follow_up_records_customer_id_idx ON follow_up_records(customer_id);
CREATE INDEX IF NOT EXISTS follow_up_records_user_id_idx ON follow_up_records(user_id);
CREATE INDEX IF NOT EXISTS follow_up_records_follow_up_at_idx ON follow_up_records(follow_up_at);

-- 提成记录表
CREATE TABLE IF NOT EXISTS commission_records (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id VARCHAR(36) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  total_commission NUMERIC(10,2) NOT NULL,
  paid_commission NUMERIC(10,2) NOT NULL DEFAULT 0,
  finance_days NUMERIC(6,2),
  other_days NUMERIC(6,2),
  remark TEXT,
  user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS commission_records_customer_id_idx ON commission_records(customer_id);
CREATE INDEX IF NOT EXISTS commission_records_user_id_idx ON commission_records(user_id);

-- 待办事项表
CREATE TABLE IF NOT EXISTS todos (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  customer_id VARCHAR(36),
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'low',
  completed BOOLEAN DEFAULT false NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS todos_user_id_idx ON todos(user_id);
CREATE INDEX IF NOT EXISTS todos_due_date_idx ON todos(due_date);
CREATE INDEX IF NOT EXISTS todos_completed_idx ON todos(completed);
CREATE INDEX IF NOT EXISTS todos_customer_id_idx ON todos(customer_id);

-- 日程排期表
CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id VARCHAR(36) NOT NULL,
  schedule_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS schedules_user_id_idx ON schedules(user_id);
CREATE INDEX IF NOT EXISTS schedules_schedule_date_idx ON schedules(schedule_date);
CREATE INDEX IF NOT EXISTS schedules_customer_id_idx ON schedules(customer_id);

-- 实施日志表
CREATE TABLE IF NOT EXISTS implementation_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id VARCHAR(36) NOT NULL,
  log_date TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_days NUMERIC(6,2) NOT NULL,
  summary TEXT NOT NULL,
  meeting_link VARCHAR(500),
  user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS implementation_logs_user_id_idx ON implementation_logs(user_id);
CREATE INDEX IF NOT EXISTS implementation_logs_customer_id_idx ON implementation_logs(customer_id);
CREATE INDEX IF NOT EXISTS implementation_logs_log_date_idx ON implementation_logs(log_date);

-- 用户配置表
CREATE TABLE IF NOT EXISTS user_profiles (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL UNIQUE,
  avatar_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 健康检查表（系统使用）
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
