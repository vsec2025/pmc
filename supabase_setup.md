# Hướng dẫn cấu hình Supabase cho PMC

Tài liệu này mô tả cách thiết lập cơ sở dữ liệu, cấu hình xác thực Google và xây dựng các chính sách truy cập (RLS) cho ứng dụng **Project Management Console (PMC)**. Hệ thống sử dụng Supabase làm backend (PostgreSQL + Auth).

## 1. Tạo dự án Supabase mới

1. Đăng nhập vào [Supabase](https://supabase.com) và tạo một **Project** mới.
2. Ghi lại `API URL` và **Public Anon Key** từ trang **Project settings → API**; bạn sẽ cần chúng để cấu hình client (`script.js`).
3. Trong trang **Database → SQL Editor**, chạy nội dung của file `init.sql` để khởi tạo cấu trúc bảng:

   ```sql
   -- sao chép nội dung init.sql vào đây và chạy
   ```

4. Kiểm tra dữ liệu mẫu trong bảng `users`; đổi địa chỉ email và tên theo đội ngũ của bạn. Các tài khoản này sẽ được phép đăng nhập.

## 2. Cấu hình xác thực Google

PMC sử dụng đăng nhập bằng Google thông qua **Supabase Auth**. Để cấu hình:

1. Trong trang **Authentication → Providers**, chọn **Google**.
2. Cung cấp **Client ID** và **Client Secret** từ [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Hướng dẫn tóm tắt:
   - Tạo một **OAuth 2.0 Client ID** loại *Web application*.
   - Thêm `https://<your-project-ref>.supabase.co/auth/v1/callback` vào danh sách **Authorized redirect URIs**.
3. Kích hoạt nhà cung cấp Google và lưu lại.
4. Trong tab **URL Configuration**, thêm domain của GitHub Pages (ví dụ `https://vsec2025.github.io/pmc`) vào **Site URL** để cho phép đăng nhập từ trang đã triển khai.

## 3. Thiết lập Row Level Security (RLS)

Để bảo vệ dữ liệu, Supabase sử dụng các chính sách RLS. Dưới đây là các chính sách mẫu phù hợp với yêu cầu của PMC. Tất cả bảng phải bật RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`) trước khi tạo policy.

### Bảng `users`

*Chỉ quản trị viên có thể xem danh sách người dùng.*

```sql
alter table users enable row level security;
create policy "Users: admin can read" on users
  for select using (exists (select 1 from users as u where u.user_id = auth.uid() and u.role = 'admin'));
```

### Bảng `projects`

*Ai cũng có thể xem; chỉ quản trị viên được tạo/sửa/xóa.*

```sql
alter table projects enable row level security;
-- Quyền xem (select) cho tất cả người đăng nhập
create policy "Projects: all authenticated can read" on projects
  for select using (auth.role() = 'authenticated');
-- Chỉ admin có thể chèn/cập nhật/xóa
create policy "Projects: admin can write" on projects
  for all using (exists (select 1 from users where user_id = auth.uid() and role = 'admin'));
```

### Bảng `tasks`

*Người thực hiện hoặc quản trị viên có thể xem và cập nhật công việc của mình.*

```sql
alter table tasks enable row level security;
-- Xem các task của chính mình hoặc tất cả nếu là admin
create policy "Tasks: read own or admin" on tasks
  for select using (
    exists (select 1 from users where user_id = auth.uid() and role = 'admin')
    or assignee = auth.uid()
  );
-- Tạo task: chỉ admin hoặc tự gán cho mình
create policy "Tasks: insert" on tasks
  for insert with check (
    exists (select 1 from users where user_id = auth.uid() and role = 'admin')
    or assignee = auth.uid()
  );
-- Cập nhật: admin hoặc assignee
create policy "Tasks: update" on tasks
  for update using (
    exists (select 1 from users where user_id = auth.uid() and role = 'admin')
    or assignee = auth.uid()
  );
```

### Bảng `weekly_reports`

*Người dùng có thể xem/gửi báo cáo của mình; quản trị viên xem tất cả.*

```sql
alter table weekly_reports enable row level security;
-- Xem: admin xem tất cả hoặc xem báo cáo của mình
create policy "Weekly reports: read" on weekly_reports
  for select using (
    exists (select 1 from users where user_id = auth.uid() and role = 'admin')
    or user_id = auth.uid()
  );
-- Gửi báo cáo: chỉ gửi cho chính mình
create policy "Weekly reports: insert" on weekly_reports
  for insert with check (user_id = auth.uid());
```

Sau khi tạo các policy trên, bạn có thể kiểm thử bằng cách đăng nhập bằng tài khoản có vai trò `admin` và `stam` để xác nhận quyền truy cập.

## 4. Cấu hình môi trường phía client

Trong file `script.js`, sửa hai dòng đầu tiên để trỏ tới URL và anon key của dự án Supabase:

```javascript
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

Đây là public anon key, an toàn để đưa lên GitHub Pages. Không sử dụng **service role key** trên client.

## 5. Phân quyền người dùng

- Tài khoản có trường `role = 'admin'` được xem và chỉnh sửa tất cả dự án/công việc, xuất báo cáo.
- Tài khoản `role = 'stam'` chỉ xem dự án và công việc được gán cho mình, được tạo/cập nhật công việc của mình và gửi báo cáo tuần.

Sau khi hoàn tất các bước trên, WebApp PMC sẽ hoạt động với Supabase như backend.