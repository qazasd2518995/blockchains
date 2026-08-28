import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { I18nProvider } from './i18n/useTranslation';
import { adminBrand } from '@admin-brand';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

document.title = adminBrand.pageTitle;
document.documentElement.dataset.adminRealm = adminBrand.realm;
document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', adminBrand.themeColor);
document.querySelector<HTMLLinkElement>('link[data-admin-brand-icon]')?.setAttribute('href', adminBrand.emblemAsset);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  </React.StrictMode>,
);
