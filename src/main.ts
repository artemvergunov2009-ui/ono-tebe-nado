import './style.css';
import { supabase } from './lib/supabase';
import { renderAuth, setupAuth } from './auth';
import { renderChat, setupChat } from './chat';

if (!document.getElementById('fa-link')) {
  const link = document.createElement('link');
  link.id = 'fa-link';
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';
  document.head.appendChild(link);
}

const app = document.querySelector<HTMLDivElement>('#app')!;

// Регистрация Service Worker для системных PWA-уведомлений (iOS/Android)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW registration failed: ', err);
    });
  });
}

let currentSession: any = null;
let isInitialized = false;

// Отслеживаем изменения состояния авторизации в реальном времени
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    if (!currentSession) {
      currentSession = session;
      isInitialized = true;
      renderChat(app);
      setupChat(session);
    }
  } else {
    if (currentSession || !isInitialized) {
      currentSession = null;
      isInitialized = true;
      supabase.removeAllChannels(); // Очищаем каналы только при выходе
      renderAuth(app);
      setupAuth();
    }
  }
});
