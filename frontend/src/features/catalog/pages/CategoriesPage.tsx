import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { demoCategories, demoProducts } from '../../catalog/demo-data.js';

export function CategoriesPage() {
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight />
        <span>Categories</span>
      </div>
      <div className="catalog-title">
        <div>
          <span className="section-eyebrow">EXPLORE NEXORA</span>
          <h1>Product categories</h1>
          <p>Find inspiration in things that suit you.</p>
        </div>
      </div>
      <div className="category-grid category-grid-large">
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
              <small>
                {
                  demoProducts.filter((p) => p.categoryId === category.id)
                    .length
                }{' '}
                products
              </small>
            </div>
            <ArrowRight className="category-arrow" />
          </Link>
        ))}
      </div>
    </div>
  );
}
