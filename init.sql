-- SQL script for initializing the Supabase database for the
-- Project Management Console (PMC) application.
--
-- This script creates the necessary tables with appropriate data types,
-- constraints and primary keys. It also creates the uuid extension for
-- generating UUIDs.

-- Enable uuid generation extension if not already present
create extension if not exists "uuid-ossp";

-- Users table stores authorised employees and their roles
create table if not exists users (
  user_id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('admin','stam'))
);

-- Projects table holds projects information
create table if not exists projects (
  project_id text primary key,
  project_name text not null,
  client_name text,
  start_date date,
  end_date date,
  status text not null check (status in ('dang thuc hien','da hoan thanh','tam dung')),
  progress numeric check (progress >= 0 and progress <= 100)
);

-- Tasks table records individual tasks linked to projects and assigned users
create table if not exists tasks (
  task_id text primary key,
  project_id text not null references projects(project_id) on delete cascade,
  task_name text not null,
  assignee uuid not null references users(user_id) on delete set null,
  status text not null check (status in ('chua lam','dang lam','hoan thanh')),
  due_date date,
  progress numeric check (progress >= 0 and progress <= 100),
  note text
);

-- Weekly reports table captures weekly summaries submitted by users
create table if not exists weekly_reports (
  report_id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(user_id) on delete cascade,
  week_number int not null,
  year int not null,
  summary text not null
);

-- Sample seed data (optional) - remove these lines in production
insert into users (email, full_name, role) values
  ('admin@example.com', 'Quản trị viên', 'admin'),
  ('designer1@example.com', 'Nhân viên 1', 'stam'),
  ('designer2@example.com', 'Nhân viên 2', 'stam')
on conflict do nothing;