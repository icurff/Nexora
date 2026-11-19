import { ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

export function PolicyPage() {
  const { slug = 'shipping' } = useParams();
  const data: Record<
    string,
    { title: string; intro: string; sections: [string, string][] }
  > = {
    shipping: {
      title: 'Shipping policy',
      intro:
        'Nexora strives to deliver your choices quickly and in good condition.',
      sections: [
        [
          'Delivery times',
          'Orders are usually delivered within 2–4 business days, depending on location.',
        ],
        [
          'Shipping fees',
          'Orders of at least 500,000 ₫ qualify for free delivery. A standard 30,000 ₫ fee applies to other orders.',
        ],
        [
          'Order tracking',
          'You can track delivery progress in My orders.',
        ],
      ],
    },
    returns: {
      title: 'Returns & refunds',
      intro: 'If a product is not right for you, we are here to help.',
      sections: [
        [
          'Return window',
          'Return requests are accepted within 7 days of delivery.',
        ],
        [
          'Conditions',
          'Products must be unused, retain their tags, and include order information.',
        ],
        [
          'Contact support',
          'Email hello@nexora.vn for help with returns.',
        ],
      ],
    },
    privacy: {
      title: 'Privacy policy',
      intro:
        'We value your privacy and personal information.',
      sections: [
        [
          'Information collected',
          'Account and delivery information is used only to support your shopping experience.',
        ],
        [
          'Data protection',
          'Nexora takes appropriate measures to protect customer information.',
        ],
        [
          'Your rights',
          'You may request to view or update your account information at any time.',
        ],
      ],
    },
    terms: {
      title: 'Shopping terms',
      intro:
        'These basic terms help make shopping clear and convenient.',
      sections: [
        [
          'Placing orders',
          'Please review your products, address and payment method before confirming.',
        ],
        [
          'Payment',
          'Prices are shown in Vietnamese dong and include applicable taxes.',
        ],
        [
          'Support',
          'Contact Nexora customer support if you need help with an order.',
        ],
      ],
    },
  };
  const policy = data[slug] ?? data.shipping;
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight />
        <span>Policies</span>
      </div>
      <div className="policy-layout">
        <aside className="policy-nav">
          <span className="section-eyebrow">HELP</span>
          <h2>Policies</h2>
          <Link
            className={slug === 'shipping' ? 'active' : ''}
            to="/policies/shipping"
          >
            Shipping <ChevronRight />
          </Link>
          <Link
            className={slug === 'returns' ? 'active' : ''}
            to="/policies/returns"
          >
            Returns & refunds <ChevronRight />
          </Link>
          <Link
            className={slug === 'privacy' ? 'active' : ''}
            to="/policies/privacy"
          >
            Privacy <ChevronRight />
          </Link>
          <Link
            className={slug === 'terms' ? 'active' : ''}
            to="/policies/terms"
          >
            Terms <ChevronRight />
          </Link>
        </aside>
        <article className="policy-content">
          <span className="section-eyebrow">NEXORA · UPDATED 2026</span>
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
