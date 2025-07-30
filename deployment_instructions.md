# Hướng dẫn triển khai lên GitHub Pages

Ứng dụng PMC là một website tĩnh (chỉ dùng HTML/CSS/JS) nên rất phù hợp triển khai trên GitHub Pages. Dưới đây là các bước để đưa mã nguồn lên GitHub và xuất bản.

## 1. Tạo repository

1. Đăng nhập vào GitHub và tạo một repository mới, ví dụ `pmc`.
2. Chọn **Public** repository để người khác có thể truy cập trang. Không cần tạo `README` hay file `.gitignore` vì chúng ta sẽ đẩy mã lên sau.

## 2. Chuẩn bị mã nguồn

1. Trong thư mục `pmc_webapp` (đi kèm với tài liệu này) có các file:
   - `index.html` – trang chính của ứng dụng.
   - `styles.css` – định kiểu tùy chỉnh.
   - `script.js` – logic giao tiếp với Supabase.
   - `init.sql` – khởi tạo cơ sở dữ liệu Supabase.
   - `supabase_setup.md` – tài liệu cấu hình Supabase.
   - `deployment_instructions.md` – tài liệu triển khai này.
2. Mở file `script.js` và thay thế `SUPABASE_URL` và `SUPABASE_ANON_KEY` bằng giá trị dự án của bạn.
3. (Tuỳ chọn) tạo file `CNAME` nếu bạn muốn gắn tên miền riêng cho GitHub Pages.

## 3. Đẩy mã nguồn lên GitHub

Sử dụng dòng lệnh Git:

```bash
cd pmc_webapp
git init
git remote add origin https://github.com/<username>/pmc.git
git add .
git commit -m "Initial commit of PMC webapp"
git push -u origin main
```

Thay `<username>` bằng tên GitHub của bạn. Nếu repository sử dụng nhánh `master` thay vì `main`, hãy thay đổi lệnh push tương ứng.

## 4. Kích hoạt GitHub Pages

1. Truy cập trang repository trên GitHub.
2. Vào **Settings → Pages**.
3. Tại phần **Source**, chọn nhánh `main` (hoặc `master`) và thư mục root (/) rồi nhấn **Save**.
4. Sau vài phút, GitHub sẽ xây dựng và cung cấp cho bạn một URL dạng `https://<username>.github.io/pmc/`. Đây là địa chỉ mà bạn dùng để đăng nhập vào ứng dụng.

### Lưu ý khi triển khai

- Vì GitHub Pages chỉ phục vụ các file tĩnh, hãy đảm bảo tất cả nội dung nằm trong thư mục gốc hoặc thư mục `docs` (nếu cấu hình khác). Trong ví dụ này, thư mục gốc của repository chứa `index.html`.
- Supabase yêu cầu thêm URL GitHub Pages vào cấu hình **Site URL** để xác thực Google hoạt động (xem `supabase_setup.md`).
- Bạn có thể sử dụng Action CI/CD của GitHub để tự động đẩy mã mỗi khi commit. Tuy nhiên, với ứng dụng tĩnh đơn giản, việc push thủ công là đủ.

Sau khi hoàn thành, bạn có thể truy cập trang để kiểm tra và chia sẻ link cho đội ngũ nội bộ sử dụng.