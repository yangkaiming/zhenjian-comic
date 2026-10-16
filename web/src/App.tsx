import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Toaster from './components/Toaster';
import Home from './pages/Home';
import Category from './pages/Category';
import Rank from './pages/Rank';
import Bookshelf from './pages/Bookshelf';
import Search from './pages/Search';
import Detail from './pages/Detail';
import Reader from './pages/Reader';
import Login from './pages/Login';
import Mine from './pages/Mine';
import AdminReports from './pages/AdminReports';
import AdminUsers from './pages/AdminUsers';
import AdminFetch from './pages/AdminFetch';
import AdminRecommend from './pages/AdminRecommend';
import AdminFeedback from './pages/AdminFeedback';
import Feedback from './pages/Feedback';
import { useAuth } from './store/auth';
import { THEME_WINDOW_BG, useSettings } from './store/settings';
import { bridge } from './api';

export default function App() {
  const init = useAuth((s) => s.init);
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    void init();
  }, [init]);

  // 应用主题：切换整个 Electron 窗口外观
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = 'zh-CN';
    void bridge?.setWindowBgColor?.(THEME_WINDOW_BG[theme]);
  }, [theme]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/read/:chapterId" element={<Reader />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/category" element={<Category />} />
                <Route path="/rank" element={<Rank />} />
                <Route path="/bookshelf" element={<Bookshelf />} />
                <Route path="/search" element={<Search />} />
                <Route path="/comic/:id" element={<Detail />} />
                <Route path="/mine" element={<Mine />} />
                <Route path="/feedback" element={<Feedback />} />
                <Route path="/admin/reports" element={<AdminReports />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/fetch" element={<AdminFetch />} />
                <Route path="/admin/recommend" element={<AdminRecommend />} />
                <Route path="/admin/feedback" element={<AdminFeedback />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
      <Toaster />
    </HashRouter>
  );
}
