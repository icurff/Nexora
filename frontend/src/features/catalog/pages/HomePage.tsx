import {
  ArrowRight,
  BadgeCheck,
  PackageCheck,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { demoCategories, demoProducts } from '../../catalog/demo-data.js';
import {
  SectionHeading,
  ProductGrid,
} from '../components/catalog-components.js';

export function HomePage() {
  const featured = demoProducts.slice(0, 4);
  return (
    <>
      <section className="home-hero">
        <div className="page-container hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker">
              <span />
              BỘ SƯU TẬP MÙA MỚI
            </span>
            <h1>
              Những điều nhỏ bé,
              <br />
              <em>niềm vui mỗi ngày.</em>
            </h1>
            <p>
              Tìm thấy những sản phẩm hữu ích, đẹp mắt và được chọn lọc để đồng
              hành cùng nhịp sống của bạn.
            </p>
            <div className="hero-actions">
              <Link className="button-primary" to="/products">
                Khám phá bộ sưu tập <ArrowRight size={17} />
              </Link>
              <Link className="button-secondary" to="/categories">
                Xem danh mục
              </Link>
            </div>
            <div className="hero-proof">
              <div className="proof-avatars">
                <span>N</span>
                <span>A</span>
                <span>M</span>
              </div>
              <span>
                <strong>4.9/5</strong> từ hơn 1.200 khách hàng
              </span>
            </div>
          </div>
          <div className="hero-art">
            <div className="hero-art-glow" />
            <div className="hero-art-card hero-art-card-back">
              <span>
                DAILY
                <br />
                ESSENTIALS
              </span>
              <img src="/demo-products/lamp.svg" alt="Đèn bàn Aurora" />
            </div>
            <div className="hero-art-card hero-art-card-front">
              <img
                src="/demo-products/tote.svg"
                alt="Túi tote Canvas Everyday"
              />
              <div>
                <span>ĐƯỢC YÊU THÍCH</span>
                <strong>Túi tote Canvas</strong>
                <small>189.000 ₫</small>
              </div>
            </div>
            <div className="hero-art-sticker">
              NEXORA
              <br />
              <span>SELECTED</span>
            </div>
            <span className="hero-art-orbit orbit-one" />
            <span className="hero-art-orbit orbit-two" />
          </div>
        </div>
      </section>
      <div className="page-container home-content">
        <section className="trust-strip">
          <div>
            <Truck />
            <span>
              <strong>Giao hàng nhanh</strong>
              <small>Toàn quốc từ 2–4 ngày</small>
            </span>
          </div>
          <div>
            <ShieldCheck />
            <span>
              <strong>Thanh toán an toàn</strong>
              <small>Đa dạng phương thức</small>
            </span>
          </div>
          <div>
            <PackageCheck />
            <span>
              <strong>Đổi trả dễ dàng</strong>
              <small>Trong vòng 7 ngày</small>
            </span>
          </div>
          <div>
            <BadgeCheck />
            <span>
              <strong>Chọn lọc chất lượng</strong>
              <small>Yên tâm mỗi lựa chọn</small>
            </span>
          </div>
        </section>
        <section className="home-section">
          <SectionHeading
            eyebrow="MUA SẮM THEO NHU CẦU"
            title="Tìm đúng điều bạn cần"
            description="Khám phá những bộ sưu tập được chọn riêng cho bạn."
            link="/categories"
            linkText="Tất cả danh mục"
          />
          <div className="category-grid">
            {demoCategories.map((category, index) => (
              <Link
                to={`/categories/${category.id}`}
                key={category.id}
                className={`category-card category-${category.color}`}
              >
                <span className="category-number">0{index + 1}</span>
                <div className="category-icon">{category.icon}</div>
                <div>
                  <h3>{category.name}</h3>
                  <p>{category.description}</p>
                </div>
                <ArrowRight className="category-arrow" />
              </Link>
            ))}
          </div>
        </section>
        <section className="home-section">
          <SectionHeading
            eyebrow="ĐƯỢC YÊU THÍCH"
            title="Món đồ mọi người đang chọn"
            description="Những sản phẩm nổi bật trong tuần này."
            link="/products?sort=popular"
          />
          <ProductGrid products={featured} />
        </section>
        <section className="editorial-banner">
          <div>
            <span className="section-eyebrow">NEXORA NOTES · 01</span>
            <h2>
              Góc nhỏ của bạn
              <br />
              xứng đáng được chăm chút.
            </h2>
            <p>Chọn những món đồ giúp không gian sống trở nên dễ chịu hơn.</p>
            <Link className="button-secondary" to="/categories/home">
              Khám phá đồ gia dụng <ArrowRight size={16} />
            </Link>
          </div>
          <img
            src="/demo-products/lamp.svg"
            alt="Đèn Aurora trong không gian ấm áp"
          />
        </section>
        <section className="home-section">
          <SectionHeading
            eyebrow="MỚI TẠI NEXORA"
            title="Thêm một chút cảm hứng"
            link="/products"
          />
          <ProductGrid products={demoProducts.slice(4)} />
        </section>
        <section className="newsletter">
          <div>
            <span className="section-eyebrow">THƯ TỪ NEXORA</span>
            <h2>Đón những điều hay ho vào hộp thư.</h2>
            <p>Ưu đãi và bộ sưu tập mới, vừa đủ để bạn không bỏ lỡ.</p>
          </div>
          <form onSubmit={(event) => event.preventDefault()}>
            <input
              type="email"
              placeholder="Địa chỉ email của bạn"
              aria-label="Email nhận tin"
            />
            <button type="submit">
              Đăng ký <ArrowRight size={16} />
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
