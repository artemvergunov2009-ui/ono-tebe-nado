import { supabase } from './lib/supabase';

export function renderAuth(container: HTMLDivElement) {
  container.innerHTML = `
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="auth-wrapper">
      <div class="auth-card glass-panel">
        <div class="auth-logo">
          <!-- Иконка чата -->
          <i class="fas fa-comment-dots" style="font-size: 32px;"></i>
        </div>
        
        <h2 class="auth-title" id="auth-title">С возвращением!</h2>
        <p class="auth-subtitle" id="auth-subtitle">Войдите в свой аккаунт, чтобы продолжить</p>
        
        <form class="auth-form" id="auth-form">
          <div class="input-group" id="username-group" style="display: none;">
            <label for="auth-username">Никнейм</label>
            <input type="text" id="auth-username" placeholder="только строчные буквы" autocomplete="username" />
          </div>
          <div class="input-group">
            <label for="auth-email">Электронная почта</label>
            <input type="email" id="auth-email" placeholder="name@example.com" required autocomplete="email" />
          </div>
          <div class="input-group">
            <label for="auth-password">Пароль</label>
            <input type="password" id="auth-password" placeholder="••••••••" required autocomplete="current-password" />
          </div>
          
          <div id="auth-error" class="auth-error"></div>
          
          <button type="submit" class="auth-btn" id="auth-submit-btn">Войти</button>
        </form>

        <div class="auth-toggle">
          <span id="auth-toggle-text">Нет аккаунта?</span>
          <a id="auth-toggle-link">Зарегистрироваться</a>
        </div>
      </div>
    </div>
  `;
}

export function setupAuth() {
  let isLogin = true;

  const title = document.getElementById('auth-title')!;
  const subtitle = document.getElementById('auth-subtitle')!;
  const form = document.getElementById('auth-form') as HTMLFormElement;
  const emailInput = document.getElementById('auth-email') as HTMLInputElement;
  const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
  const usernameGroup = document.getElementById('username-group') as HTMLDivElement;
  const usernameInput = document.getElementById('auth-username') as HTMLInputElement;
  const submitBtn = document.getElementById('auth-submit-btn') as HTMLButtonElement;
  const toggleText = document.getElementById('auth-toggle-text')!;
  const toggleLink = document.getElementById('auth-toggle-link')!;
  const errorDisplay = document.getElementById('auth-error')!;

  // Переключение между Входом и Регистрацией
  toggleLink.addEventListener('click', () => {
    isLogin = !isLogin;
    errorDisplay.innerText = '';
    usernameInput.value = '';
    passwordInput.value = '';
    
    if (isLogin) {
      title.innerText = 'С возвращением!';
      subtitle.innerText = 'Войдите в свой аккаунт, чтобы продолжить';
      submitBtn.innerText = 'Войти';
      toggleText.innerText = 'Нет аккаунта?';
      toggleLink.innerText = 'Зарегистрироваться';
      usernameGroup.style.display = 'none';
    } else {
      title.innerText = 'Создать аккаунт';
      subtitle.innerText = 'Присоединяйтесь и начните общаться';
      submitBtn.innerText = 'Зарегистрироваться';
      toggleText.innerText = 'Уже есть аккаунт?';
      toggleLink.innerText = 'Войти';
      usernameGroup.style.display = 'block';
    }
  });

  // Обработка отправки формы
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    errorDisplay.innerText = '';
    submitBtn.disabled = true;
    submitBtn.innerText = 'Загрузка...';

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const username = usernameInput.value.trim();
        if (!username) throw new Error('Пожалуйста, введите никнейм');
        
        if (/[A-ZА-ЯЁ]/.test(username)) {
          throw new Error('Никнейм должен содержать только строчные (маленькие) буквы!');
        }

        const { error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
        if (error) throw error;
        toggleLink.click(); // Возвращаем форму в режим логина
      }
    } catch (err: any) {
      // Переводим частые ошибки Supabase на русский (опционально)
      let errorMsg = err.message;
      if (errorMsg.includes('Invalid login credentials')) errorMsg = 'Неверный email или пароль';
      if (errorMsg.includes('User already registered')) errorMsg = 'Пользователь с таким email уже существует';
      if (errorMsg.includes('Password should be at least')) errorMsg = 'Пароль должен содержать минимум 6 символов';
      if (errorMsg.includes('Email not confirmed')) errorMsg = 'Почта не подтверждена. Перейдите по ссылке из письма или отключите "Confirm email" в Supabase.';
      
      errorDisplay.innerText = errorMsg;
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = isLogin ? 'Войти' : 'Зарегистрироваться';
    }
  });
}
