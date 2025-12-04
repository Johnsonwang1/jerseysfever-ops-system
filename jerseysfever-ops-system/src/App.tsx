import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProductsPage } from './pages/ProductsPage';
import { SyncIndicator } from './components/SyncToast';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/products" replace />} />
          <Route path="products" element={<ProductsPage />} />
        </Route>
      </Routes>
      {/* 全局同步状态指示器 */}
      <SyncIndicator />
    </BrowserRouter>
  );
}

export default App;
