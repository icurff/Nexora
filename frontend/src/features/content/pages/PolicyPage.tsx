import { ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

export function PolicyPage() {
  const { slug = 'shipping' } = useParams();
  const data: Record<
    string,
    { title: string; intro: string; sections: [string, string][] }
  > = {
    shipping: {
      title: 'Chính sách giao hàng',
      intro:
        'Nexora luôn cố gắng đưa lựa chọn của bạn đến nơi nhanh chóng và nguyên vẹn.',
      sections: [
        [
          'Thời gian giao hàng',
          'Đơn hàng thường được giao trong 2–4 ngày làm việc tùy theo khu vực.',
        ],
        [
          'Phí vận chuyển',
          'Miễn phí giao hàng cho đơn hàng từ 500.000 ₫. Các đơn còn lại có phí tiêu chuẩn 30.000 ₫.',
        ],
        [
          'Theo dõi đơn hàng',
          'Bạn có thể theo dõi tiến trình giao hàng trong mục Đơn hàng của tôi.',
        ],
      ],
    },
    returns: {
      title: 'Đổi trả & hoàn tiền',
      intro: 'Nếu sản phẩm chưa phù hợp, chúng tôi sẵn sàng hỗ trợ bạn.',
      sections: [
        [
          'Thời hạn đổi trả',
          'Yêu cầu đổi trả được tiếp nhận trong vòng 7 ngày kể từ ngày nhận hàng.',
        ],
        [
          'Điều kiện',
          'Sản phẩm còn nguyên tem nhãn, chưa qua sử dụng và có thông tin đơn hàng.',
        ],
        [
          'Liên hệ hỗ trợ',
          'Gửi email tới hello@nexora.vn để được hướng dẫn quy trình đổi trả.',
        ],
      ],
    },
    privacy: {
      title: 'Chính sách bảo mật',
      intro:
        'Chúng tôi trân trọng quyền riêng tư và thông tin cá nhân của bạn.',
      sections: [
        [
          'Thông tin thu thập',
          'Thông tin tài khoản và giao hàng chỉ được dùng để phục vụ trải nghiệm mua sắm.',
        ],
        [
          'Bảo vệ dữ liệu',
          'Nexora áp dụng các biện pháp phù hợp để bảo vệ thông tin của khách hàng.',
        ],
        [
          'Quyền của bạn',
          'Bạn có thể yêu cầu xem hoặc cập nhật thông tin tài khoản của mình bất cứ lúc nào.',
        ],
      ],
    },
    terms: {
      title: 'Điều khoản mua hàng',
      intro:
        'Các điều khoản cơ bản giúp quá trình mua sắm diễn ra minh bạch và thuận tiện.',
      sections: [
        [
          'Đặt hàng',
          'Vui lòng kiểm tra sản phẩm, địa chỉ và phương thức thanh toán trước khi xác nhận.',
        ],
        [
          'Thanh toán',
          'Giá hiển thị bằng Việt Nam Đồng và đã bao gồm các khoản thuế áp dụng.',
        ],
        [
          'Hỗ trợ',
          'Nếu cần hỗ trợ về đơn hàng, hãy liên hệ đội ngũ chăm sóc khách hàng của Nexora.',
        ],
      ],
    },
  };
  const policy = data[slug] ?? data.shipping;
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <span>Chính sách</span>
      </div>
      <div className="policy-layout">
        <aside className="policy-nav">
          <span className="section-eyebrow">TRỢ GIÚP</span>
          <h2>Chính sách</h2>
          <Link
            className={slug === 'shipping' ? 'active' : ''}
            to="/policies/shipping"
          >
            Giao hàng <ChevronRight />
          </Link>
          <Link
            className={slug === 'returns' ? 'active' : ''}
            to="/policies/returns"
          >
            Đổi trả & hoàn tiền <ChevronRight />
          </Link>
          <Link
            className={slug === 'privacy' ? 'active' : ''}
            to="/policies/privacy"
          >
            Bảo mật <ChevronRight />
          </Link>
          <Link
            className={slug === 'terms' ? 'active' : ''}
            to="/policies/terms"
          >
            Điều khoản <ChevronRight />
          </Link>
        </aside>
        <article className="policy-content">
          <span className="section-eyebrow">NEXORA · CẬP NHẬT 2026</span>
          <h1>{policy.title}</h1>
          <p className="policy-intro">{policy.intro}</p>
          {policy.sections.map(([title, body], index) => (
            <section key={title}>
              <span>0{index + 1}</span>
              <div>
                <h2>{title}</h2>
                <p>{body}</p>
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
