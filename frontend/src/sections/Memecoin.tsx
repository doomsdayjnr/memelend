import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import axios from 'axios';

import NewCreatedToken from '../components/token_lists/NewCreatedToken';
import TokenDetail from '../components/TokenDetail';
import TrendingTokens from '../components/token_lists/TrendingTokens';
import ShortedTokens from '../components/token_lists/ShortedTokens';
import '../styles/chart/Memecoin.css';
import CategoriesView from '../components/token_lists/CategoriesView';

function Memecoin() {
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedTab, setSelectedTab] = useState<'new' | 'trending' | 'borrow' | null>(null);
  const [searchMint, setSearchMint] = useState('');
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
    else if (location.pathname.endsWith('/trending')) setSelectedTab('trending');
    else if (location.pathname.endsWith('/borrow')) setSelectedTab('borrow');
    else setSelectedTab(null); // when viewing a token or unknown path
  }, [location.pathname]);

  useEffect(() => {
    axios.get(`${apiBase}/tokens/categories/active`)
      .then(res => setCategories(res.data))
      .catch(err => console.error("Failed to load categories", err));
  }, []);

  const handleTabClick = (tab: 'new' | 'trending' | 'borrow') => {
    setSelectedTab(tab);
    navigate(`/memecoins/${tab}`);
  };

  const handleSearch = () => {
    if (!searchMint) return;
    // Navigate to the token detail page by mint address
    navigate(`/memecoins/token/${searchMint}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleCategoryClick = (subcategoryId: number) => {
    navigate(`/memecoins/category/${subcategoryId}`);
  };

  return (
    <div className="memecoin-container">
      <aside className="sidebar">
        {/* Search Bar */}
        <div className="search-bar">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by mint address..."
              value={searchMint}
              onChange={(e) => setSearchMint(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            {searchMint && (
              <button
                className="clear-btn"
                onClick={() => setSearchMint('')}
                title="Clear"
              >
                ❌
              </button>
            )}
          </div>
        </div>

        {/* Default tabs */}
        <button
          className={`sidebar-btn ${selectedTab === 'new' ? 'active' : ''}`}
          onClick={() => handleTabClick('new')}
        >
          🆕 New Tokens
        </button>
        <button
          className={`sidebar-btn ${selectedTab === 'trending' ? 'active' : ''}`}
          onClick={() => handleTabClick('trending')}
        >
          🔥 Trending
        </button>
        <button
          className={`sidebar-btn ${selectedTab === 'borrow' ? 'active' : ''}`}
          onClick={() => handleTabClick('borrow')}
        >
          📉 Top Borrowed
        </button>

        {/* Divider */}
        <hr />

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
          <Route path="/" element={<Navigate to="/memecoins/new" replace />} />

          {/* Tabs */}
          <Route path="/new" element={<NewCreatedToken />} />
          <Route path="/trending" element={<TrendingTokens />} />
          <Route path="/borrow" element={<ShortedTokens />} />

          {/* Token detail page */}
          <Route path="/token/:mint" element={<TokenDetail />} />

          {/* Category view page */}
          <Route path="/category/:subcategoryId" element={<CategoriesView />} />
          
        </Routes>
      </main>
    </div>
  );
}

export default Memecoin;
