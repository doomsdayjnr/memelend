import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/chart/Memecoin.css';
import NewPresaleToken from '../components/presale_lists/NewPresaleToken';
import PresaleCategoriesView from '../components/presale_lists/PresaleCategoriesView';

function Presale() {
    const navigate = useNavigate();
    const location = useLocation();

    const [selectedTab, setSelectedTab] = useState<'new'| null>(null);
    const [collapsedCategories, setCollapsedCategories] = useState<number[]>([]);
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    // Categories
    const [categories, setCategories] = useState<any[]>([]);

    const toggleCategory = (categoryId: number) => {
    setCollapsedCategories(prev =>
        prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId) // collapse
        : [...prev, categoryId] // expand
    );
    };

    useEffect(() => {
    if (location.pathname.endsWith('/new')) setSelectedTab('new');
    else setSelectedTab(null); // when viewing a token or unknown path
    }, [location.pathname]);

    useEffect(() => {
    axios.get(`${apiBase}/tokens/presale-categories/active`)
        .then(res => setCategories(res.data))
        .catch(err => console.error("Failed to load categories", err));
    }, []);

    const handleTabClick = (tab: 'new') => {
    setSelectedTab(tab);
    navigate(`/presale/${tab}`);
    };

    const handleCategoryClick = (subcategoryId: number) => {
    navigate(`/presale/category/${subcategoryId}`);
    };
    
  return (
    <div className="memecoin-container">
      <aside className="sidebar">
        {/* Default tabs */}
        <button
          className={`sidebar-btn ${selectedTab === 'new' ? 'active' : ''}`}
          onClick={() => handleTabClick('new')}
        >
          🆕 New Tokens
        </button>

        {/* Categories */}
        <div className="categories-section">
          <h4>Categories</h4>
          {categories.length === 0 ? (
            <p className="no-categories">No active categories yet</p>
          ) : (
            categories.map(cat => (
              <div key={cat.id} className="category-group">
                <div
                  className="category-name clickable"
                  onClick={() => toggleCategory(cat.id)}
                >
                  🗂️ {cat.name}
                  <span className="collapse-icon">
                    {collapsedCategories.includes(cat.id) ? '▾' : '▸'}
                  </span>
                </div>
                {collapsedCategories.includes(cat.id) && (
                  <div className="subcategory-list">
                    {cat.subcategories.map((sub: any) => (
                      <button
                        key={sub.id}
                        className="subcategory-btn"
                        onClick={() => handleCategoryClick(sub.id)}
                      >
                        {sub.name} <span className="count">({sub.tokenCount})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="content">
        <Routes>
          {/* Default route → redirect to /new */}
          <Route path="/" element={<Navigate to="/presale/new" replace />} />

          {/* Tabs */}
          <Route path="/new" element={<NewPresaleToken />} />
          
          {/* Category view page */}
          <Route path="/category/:subcategoryId" element={<PresaleCategoriesView />} />
          
        </Routes>
      </main>
    </div>
  )
}

export default Presale