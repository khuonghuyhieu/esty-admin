# Etsy API first — kế hoạch kỹ thuật tối giản

Cập nhật 23/10/2026. Mục tiêu mới: đăng ký app Etsy và thực hiện được một lệnh đọc dữ liệu shop đã cấp quyền. Phạm vi chủ dự án xác nhận: kết nối **shop của mình và shop của seller khác**. BurgerPrints (SUP-05) vẫn là supplier pilot; chi tiết vận hành được làm rõ song song. Landing page ở `dist` phục vụ giới thiệu app khi đăng ký, chưa có OAuth hoặc API thật.

## 1. Mốc quyết định gần nhất

**Loại app đã chốt theo use case:** chọn **Create a personal app** trên Etsy Developer Portal. Personal App là điểm bắt đầu cho sản phẩm dùng ngoài shop của mình ở quy mô giới hạn; sau khi được duyệt và sẵn sàng mở rộng cho nhiều seller, xin **Commercial Access trên cùng app**. Seller App chỉ truy cập shop của chủ app, nên không đáp ứng phạm vi đã chốt. Kiểm tra trường website và điều kiện cụ thể trên form account thực tế; không mặc định một landing page tự động bảo đảm approval. [Nguồn Etsy](https://developers.etsy.com/).

**Đăng ký và thử API:** người sở hữu account Etsy điền form, chấp thuận điều khoản và giữ key/secret trong secret manager. Sau khi được cấp app, đăng ký callback HTTPS chính xác, làm OAuth PKCE **riêng cho mỗi seller**, xin scope đọc tối thiểu (ví dụ `transactions_r` nếu đọc receipts/order), gọi một endpoint đọc shop/order phù hợp. Thử trên shop của mình trước; sau đó chỉ thử shop seller khác khi Etsy đã cho phép và seller đó tự cấp quyền OAuth. Kết quả cần ghi: endpoint, scope, thời điểm, HTTP status, field có/thiếu, lỗi; không ghi token hay PII vào Notion. [Nguồn OAuth Etsy](https://developers.etsy.com/documentation/essentials/oauth2/).

**Nếu app/API chưa được cấp kịp:** chờ flow thay thế do Product Owner mô tả. Trong lúc chờ, dùng CSV Etsy đã có để xây data contract và bộ kiểm tra mapping. Nhánh này là phương án chuẩn bị, chưa quyết định thay API.

## 2. Bộ khung Backend – DB – Frontend cần chuẩn bị

| Thành phần | Chuẩn bị ngay | Chỉ triển khai sau khi có evidence/Go |
|---|---|---|
| Backend | Chọn runtime/framework theo repo hiện có; thiết kế route OAuth start/callback với state + PKCE riêng cho từng seller, token storage, Etsy client, import job và log lỗi. Tách adapter `Etsy API` / `CSV` sau khi flow thay thế được chốt. | Kết nối credentials thật, đồng bộ định kỳ, xử lý refresh/retry/rate limit và ngắt kết nối. |
| DB | Draft bảng `seller_accounts`, `shops`, `etsy_connections`, `orders`, `order_lines`, `supplier_exports`, `sync_runs`; mọi bản ghi gắn seller/shop, khóa duy nhất theo shop + Etsy ID. | Migration chính thức, token mã hóa, phân quyền và kiểm tra tách dữ liệu giữa các seller, retention/deletion. |
| Frontend | Phác 3 màn: từng seller kết nối shop bằng OAuth, danh sách đơn của đúng shop, chi tiết đơn + lỗi dữ liệu + trạng thái gửi supplier. | Giao diện làm việc với đơn thật, quyền người dùng và ngắt kết nối. |

Đối chiếu lại ngày 24/10: link “Technical Architecture & Spike Findings” trước đây thuộc **Camp Ticket**, không phải quyết định kiến trúc E-commerce. [Technical Spike Findings của E-commerce](https://docs.google.com/document/d/1qTKpEP8WRu0wve_HJGb1XBG7rkRnz_Rhvj-RDHIwA7o/edit) vẫn là template, chưa ghi stack FE/BE/DB. Chủ dự án đã cho phép setup foundation local; đang chờ đúng tài liệu stack đã chốt hoặc xác nhận FE/BE/DB để triển khai. Bảng trên là hướng chuẩn bị, chưa phải schema/module nghiệp vụ đã duyệt. Xem `PROJECT_STATE.md` cho handoff mới nhất.

## 3. Thứ tự triển khai để biết mình đã tiến được bao xa

1. **URL landing page dùng được + Personal App:** trang giới thiệu có HTTPS; kiểm tra yêu cầu trên form thực tế và nộp Personal App với use case shop của mình + seller khác.
2. **API proof:** có key, OAuth shop của mình thành công và một lệnh đọc shop/order trả dữ liệu. Đây là mốc kỹ thuật số 1. Seller khác chỉ thử sau khi phạm vi được Etsy duyệt và họ cấp OAuth.
3. **Data contract:** đối chiếu field Etsy với CSV và BurgerPrints; ghi field thiếu, personalization, biến thể.
4. **C3 Go cho MVP:** chốt flow vận hành, stack/repo, scope, acceptance và estimate trước khi build tính năng production.

Docs cũ đặt walkthrough operator lên trước. Theo ưu tiên mới của chủ dự án, Etsy access là nhánh dẫn đầu; walkthrough/mapping tiếp tục song song để API proof không bị chờ bởi việc vận hành.

Nguồn đối chiếu: [Product Brief & Roadmap](https://docs.google.com/document/d/1UYPYpqzjHB9y3Fc3dDUUc4vHJlv_vkBitDQc7Ih-Ago/edit) (working draft), [Technical Spike Findings](https://docs.google.com/document/d/1qTKpEP8WRu0wve_HJGb1XBG7rkRnz_Rhvj-RDHIwA7o/edit) (template). Những tài liệu này chưa ghi kết quả API test hay stack được phê duyệt.
