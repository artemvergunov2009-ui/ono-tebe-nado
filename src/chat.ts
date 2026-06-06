import { supabase } from './lib/supabase';

let currentChatId: string | null = null;
let myUserId: string | null = null;
let myUsername: string = 'Пользователь';
let pendingDirectChatUserId: string | null = null;
let pendingDirectChatUsername: string | null = null;

let myChatIds: string[] = [];
let currentChatMembersMap: Record<string, any> = {};

let currentRoomChannel: any = null;
let currentChatIsGroup: boolean = false; // Флаг для определения типа текущего чата
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let callType: 'audio' | 'video' = 'audio';
let pendingOffer: any = null;
const renderedMessageIds = new Set<string>();
const processedNotifications = new Set<string>();

export function renderChat(container: HTMLDivElement) {
  container.innerHTML = `
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    
    <div class="app-container">
      <style>
        .tg-sheet-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.7); z-index: 9999;
          opacity: 0; pointer-events: none; transition: opacity 0.3s;
          display: flex; justify-content: center; align-items: flex-end;
        }
        .tg-sheet-overlay.active { opacity: 1; pointer-events: auto; }
        .tg-sheet {
          background: var(--bg-color); width: 100%; max-width: 450px;
          border-radius: 16px 16px 0 0;
          transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.1, 0.9, 0.2, 1);
          display: flex; flex-direction: column; max-height: 85vh;
          box-shadow: 0 -4px 30px rgba(0,0,0,0.5);
          border: 1px solid var(--glass-border);
        }
        .tg-sheet-overlay.active .tg-sheet { transform: translateY(0); }
        .tg-sheet-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid var(--glass-border); }
        .tg-sheet-header h4 { margin: 0; font-size: 18px; color: var(--text-main); }
        .tg-sheet-close { background: none; border: none; cursor: pointer; width: 24px; height: 24px; padding: 0; display: flex; }
        .tg-sheet-close svg { width: 100%; height: 100%; fill: #64748b; transition: fill 0.2s; }
        .tg-sheet-close:hover svg { fill: white; }
        .tg-action-item { display: flex; align-items: center; padding: 12px 16px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .tg-action-icon { width: 40px; height: 40px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; margin-right: 12px; }
        
        @media (hover: hover) {
          .chat-item:hover { background: rgba(255,255,255,0.05); }
          .tg-action-item:hover { background: rgba(255,255,255,0.05); }
        }
        .message-bubble {
          word-break: break-word;
          overflow-wrap: break-word;
        }

        /* Анимация и стили для галочек */
        .msg-ticks {
          font-size: 11px;
          margin-left: 6px;
          display: inline-flex;
          align-items: center;
        }
        .msg-ticks .read { color: #34d399; } /* Зеленые галочки (прочитано) */
        .msg-ticks .delivered { color: var(--text-muted); } /* Серая галочка (отправлено) */

        /* Telegram-анимация контекстного меню */
        .context-backdrop {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0, 0, 0, 0.4);
          z-index: 9998; opacity: 0; pointer-events: none; transition: opacity 0.2s;
        }
        .context-backdrop.active { opacity: 1; pointer-events: auto; }
        
        .message-bubble {
          transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s;
        }
        .message-bubble.context-active {
          transform: scale(0.95);
          z-index: 9999;
          position: relative;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .context-menu {
          z-index: 10000;
          transform-origin: bottom center;
          animation: popUp 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes popUp {
          from { opacity: 0; transform: scale(0.8) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      </style>
      
      <aside class="sidebar glass-panel" id="sidebar-view">
          <header class="sidebar-header">
            <h2>Сообщения</h2>
            <button id="compose-btn" class="compose-btn" title="Создать чат">
              <i class="fas fa-pen"></i>
            </button>
          </header>
          <div class="search-bar">
              <i class="fas fa-search"></i>
              <input type="text" placeholder="Поиск" />
          </div>
          <div id="chats-list" class="chat-list"></div>
      </aside>

      <main class="chat-area glass-panel" id="chats-main-view">
          <div id="chat-header-container" style="display: none; height: 100%; flex-direction: column;">
            <div class="chat-header">
              <div class="chat-header-info" id="chat-header-info" style="cursor: pointer; flex: 1; display: flex; align-items: center;">
                <button id="mobile-back-btn" class="mobile-only" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;margin-right:15px;">
                  <i class="fas fa-arrow-left"></i>
                </button>
                <div id="active-chat-avatar" class="chat-avatar" style="width: 42px; height: 42px; margin-right: 12px; font-size: 18px;"></div>
                <div style="display: flex; flex-direction: column;">
                  <h3 id="active-chat-title" style="margin: 0; font-size: 16px; color: white;">Чат</h3>
                  <p id="active-chat-status" style="margin: 2px 0 0 0; font-size: 13px; color: var(--text-muted); font-weight: 500;">загрузка...</p>
                </div>
              </div>
              <div class="chat-header-actions" style="display: flex; gap: 8px;">
                <button id="call-btn" class="add-user-action" title="Аудиозвонок" style="padding: 10px; border-radius: 50%; width: 40px; height: 40px; justify-content: center;"><i class="fas fa-phone"></i></button>
                <button id="video-call-btn" class="add-user-action" title="Видеозвонок" style="padding: 10px; border-radius: 50%; width: 40px; height: 40px; justify-content: center;"><i class="fas fa-video"></i></button>
                <button class="add-user-action" id="add-user-btn" title="Добавить участника" style="padding: 10px; border-radius: 50%; width: 40px; height: 40px; justify-content: center;"><i class="fas fa-user-plus"></i></button>
              </div>
            </div>
            
            <div id="pinned-message-banner" class="chat-banner" style="display: none;"></div>

            <div id="messages-list" class="messages-list"></div>
            
            <div class="input-area" id="input-area">
              <div id="reply-banner" class="reply-banner" style="display: none;"></div>
              
              <button id="attach-btn" style="background: none; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer; padding: 0 10px; transition: color 0.2s;">
                <i class="fas fa-paperclip"></i>
              </button>
              <input type="file" id="chat-file-input" style="display: none;">

              <div class="input-wrapper">
                <input type="text" id="message-text" placeholder="Написать сообщение..." autocomplete="off" />
              </div>
              <button id="send-message-btn" class="send-btn"><i class="fas fa-paper-plane"></i></button>
            </div>
            
            <div class="multi-select-bar" id="multi-select-bar">
              <button id="multi-delete-btn" class="btn-cancel" style="color: #ef4444; width: auto; flex: 0.4;">Удалить</button>
              <button id="multi-forward-btn" class="btn-confirm" style="width: auto; flex: 0.4;">Переслать</button>
              <button id="multi-cancel-btn" class="btn-cancel" style="width: auto; flex: 0.15; background: transparent; padding: 0; color: white;">✖</button>
            </div>
          </div>
          <div id="no-chat-selected" class="empty-state" style="height: 100%; display: flex; justify-content: center; align-items: center; flex-direction: column;">
            <div class="empty-icon">
              <i class="fas fa-comment-dots"></i>
            </div>
            <p>Выберите чат для начала общения</p>
          </div>
      </main>

      <main id="calls-view" class="chat-area glass-panel" style="display: none; flex-direction: column;">
          <div class="chat-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div style="width: 40px;"></div> <h3 style="margin:0; font-size:18px; color:white; flex: 1; text-align: center;">История звонков</h3>
            <button id="clear-calls-btn" title="Очистить историю" style="color: #ef4444; background: transparent; border: none; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px;">
              <i class="fas fa-trash"></i>
            </button>
          </div>
          <ul id="calls-list" class="chat-list" style="padding: 20px; overflow-y: auto; margin: 0; flex: 1;">
          </ul>
      </main>

      <main id="settings-view" class="chat-area glass-panel" style="display: none; flex-direction: column; overflow-y: auto;">
        <div class="settings-header-bg">
          <div class="settings-top-icons">
            <div class="settings-qr-btn"><i class="fas fa-qrcode"></i></div>
            <div class="settings-edit-btn">Изм.</div>
          </div>
          <div class="settings-avatar"></div>
          <div class="settings-name">
            <span id="profile-username">Wnsuuu</span>
          </div>
          <div class="settings-phone">
            <span id="profile-email">email@example.com</span> • <span id="profile-username-handle">@user</span>
          </div>
        </div>

        <div class="settings-content">
          <div class="tg-list-group">
            <div class="tg-list-item" id="btn-my-profile">
              <div class="tg-list-left">
                <div class="tg-list-icon bg-red"><i class="fas fa-user-circle"></i></div>
                <div class="tg-list-text">Мой профиль</div>
              </div>
              <div class="tg-list-right"><i class="fas fa-chevron-right"></i></div>
            </div>
            <div class="tg-list-item" id="btn-favorites">
              <div class="tg-list-left">
                <div class="tg-list-icon bg-blue"><i class="fas fa-bookmark"></i></div>
                <div class="tg-list-text">Избранное</div>
              </div>
              <div class="tg-list-right"><i class="fas fa-chevron-right"></i></div>
            </div>
            <div class="tg-list-item" id="btn-archive">
              <div class="tg-list-left">
                <div class="tg-list-icon" style="background: #94a3b8;"><i class="fas fa-archive"></i></div>
                <div class="tg-list-text">Архив</div>
              </div>
              <div class="tg-list-right"><i class="fas fa-chevron-right"></i></div>
            </div>
            <div class="tg-list-item" id="btn-notifications">
              <div class="tg-list-left">
                <div class="tg-list-icon bg-green"><i class="fas fa-bell"></i></div>
                <div class="tg-list-text">Уведомления и звук</div>
              </div>
              <div class="tg-list-right"><i class="fas fa-chevron-right"></i></div>
            </div>
          </div>

          <div class="tg-list-group">
            <div class="tg-list-item">
              <div class="tg-list-left">
                <button id="logout-btn" class="btn-cancel" style="width: 100%;">Выйти из аккаунта</button>
              </div>
            </div>
          </div>
        </div>
      </main>

    <div id="subview-profile" class="subview glass-panel">
      <div class="chat-header">
        <button class="back-btn" id="back-from-profile" style="background:none;border:none;display:flex;align-items:center;color:var(--primary);cursor:pointer;font-size:16px;font-weight:500;">
          <i class="fas fa-arrow-left" style="margin-right:8px;"></i> Назад
        </button>
        <h3 style="flex:1;text-align:center;margin-right:70px;font-size:18px;">Мой профиль</h3>
      </div>
      <div style="padding: 32px 24px; text-align: center;">
        <div id="ro-avatar-container" style="width: 120px; height: 120px; border-radius: 50%; background: var(--accent-color); background-size: cover; background-position: center; margin: 0 auto 16px; border: 2px solid var(--glass-border);"></div>
        <h2 id="ro-username" style="font-size: 24px; margin-bottom: 8px; color: white;"></h2>
        <p id="ro-email" style="color: var(--text-muted); margin-bottom: 24px; font-size: 15px; text-shadow: none;"></p>
        <div class="tg-list-group" style="text-align: left; margin: 0;">
          <div class="tg-list-item" style="cursor: default;">
            <div class="tg-list-left">
              <div>
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">О себе</div>
                <div id="ro-description" style="font-size: 15px; color: white;">Не указано</div>
              </div>
            </div>
          </div>
          <div class="tg-list-item" style="cursor: default;">
            <div class="tg-list-left">
              <div>
                <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Дата рождения</div>
                <div id="ro-birthdate" style="font-size: 15px; color: white;">Не указана</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="subview-other-profile" class="subview glass-panel">
      <div class="chat-header">
        <button class="back-btn" id="back-from-other-profile" style="background:none;border:none;display:flex;align-items:center;color:var(--primary);cursor:pointer;font-size:16px;font-weight:500;">
          <i class="fas fa-arrow-left" style="margin-right:8px;"></i> Назад
        </button>
        <h3 style="flex:1;text-align:center;margin-right:70px;font-size:18px;">Профиль</h3>
      </div>
      <div style="padding: 32px 24px 10px; text-align: center;">
        <div id="other-avatar-container" style="width: 120px; height: 120px; border-radius: 50%; background: var(--accent-color); background-size: cover; background-position: center; margin: 0 auto 16px; border: 2px solid var(--glass-border); display: flex; align-items: center; justify-content: center; color: white; font-size: 48px; font-weight: bold;"></div>
        <h2 id="other-username" style="font-size: 24px; margin-bottom: 8px; color: white;"></h2>
        <p id="other-status" style="color: var(--green-avatar); margin-bottom: 24px; font-size: 14px; font-weight: 500;"></p>
        <div class="tg-list-group" style="text-align: left; margin: 0;">
          <div class="tg-list-item" style="cursor: default;">
            <div class="tg-list-left">
              <div><div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">О себе</div><div id="other-description" style="font-size: 15px; color: white;"></div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="section-title">Медиа, ссылки и файлы</div>
      <div class="media-grid">
        <div class="media-item"><i class="fas fa-image"></i></div>
        <div class="media-item"><i class="fas fa-video"></i></div>
        <div class="media-item"><i class="fas fa-file-audio"></i></div>
        <div class="media-item"><i class="fas fa-link"></i></div>
      </div>
    </div>

    <div id="subview-archive" class="subview glass-panel">
      <div class="chat-header">
        <button class="back-btn" id="back-from-archive" style="background:none;border:none;display:flex;align-items:center;color:var(--primary);cursor:pointer;font-size:16px;font-weight:500;">
          <i class="fas fa-arrow-left" style="margin-right:8px;"></i> Назад
        </button>
        <h3 style="flex:1;text-align:center;margin-right:70px;font-size:18px;">Архив</h3>
      </div>
      <ul id="archive-list" style="list-style: none; margin: 0; padding: 0;"></ul>
    </div>

    <div id="subview-notifications" class="subview glass-panel">
      <div class="chat-header">
        <button class="back-btn" id="back-from-notifications" style="background:none;border:none;display:flex;align-items:center;color:var(--primary);cursor:pointer;font-size:16px;font-weight:500;">
          <i class="fas fa-arrow-left" style="margin-right:8px;"></i> Назад
        </button>
        <h3 style="flex:1;text-align:center;margin-right:70px;font-size:18px;">Уведомления</h3>
      </div>
      <div style="padding: 24px;">
        <div class="tg-list-group" style="margin: 0;">
          <div class="tg-list-item" style="cursor: default;">
            <div class="tg-list-left">
              <span class="tg-list-text">Уведомления</span>
            </div>
            <div class="tg-list-right">
              <label class="toggle-switch">
                <input type="checkbox" id="toggle-notifications">
                <span class="slider"></span>
              </label>
            </div>
          </div>
        </div>
        <p style="margin-top: 16px; font-size: 13px; color: var(--text-muted); text-align: center;">Включите или выключите звуковые уведомления приложения.</p>
      </div>
    </div>

    <div id="edit-profile-modal" class="modal-overlay">
      <div class="modal-content glass-panel">
        <h3>Редактировать профиль</h3>
        
        <div class="input-group" style="margin-bottom: 12px; text-align: left;">
          <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">Загрузить аватар с устройства</label>
          <input type="file" id="edit-avatar-file" accept="image/*" style="color: white; background: rgba(0,0,0,0.2); width: 100%; border-radius: 10px; padding: 8px;">
        </div>

        <div class="input-group" style="margin-bottom: 12px; text-align: left;">
          <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">Или ссылка (URL)</label>
          <input type="text" id="edit-avatar-url" placeholder="https://..." autocomplete="off" style="color: white; background: rgba(0,0,0,0.2);">
        </div>
        <div class="input-group" style="margin-bottom: 12px; text-align: left;">
          <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">О себе</label>
          <input type="text" id="edit-description" placeholder="Немного о себе..." autocomplete="off" style="color: white; background: rgba(0,0,0,0.2);">
        </div>
        <div class="modal-actions">
          <button id="edit-cancel" class="btn-cancel">Отмена</button>
          <button id="edit-save" class="btn-confirm">Сохранить</button>
        </div>
      </div>
    </div>

    <div id="avatar-zoom-modal" class="modal-overlay" style="background: rgba(0,0,0,0.9);">
      <button id="avatar-zoom-close" style="position: absolute; top: 20px; right: 20px; background: none; border: none; color: white; cursor: pointer;">
        <i class="fas fa-times" style="font-size: 32px;"></i>
      </button>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 20px;">
        <div id="zoomed-avatar-container" style="width: 300px; height: 300px; border-radius: 50%; background: var(--accent-color); background-size: cover; background-position: center; border: 4px solid var(--glass-border);"></div>
        <button id="avatar-download-btn" class="btn-confirm" style="width: auto; padding: 10px 24px;">Скачать аватар</button>
      </div>
    </div>

    <div id="forward-modal" class="modal-overlay">
      <div class="modal-content glass-panel" style="max-height: 80vh; display: flex; flex-direction: column;">
        <h3>Выберите чат</h3>
        <ul id="forward-chats-list" style="list-style: none; padding: 0; overflow-y: auto; flex: 1;"></ul>
        <button id="forward-cancel" class="btn-cancel" style="margin-top: 16px;">Отмена</button>
      </div>
    </div>

    <div id="call-modal" class="modal-overlay" style="background: rgba(15, 12, 41, 0.95); z-index: 10000; backdrop-filter: blur(20px);">
      <div class="call-screen-content" style="position:relative; width:100%; height:100%;">
        <video id="remote-video" autoplay playsinline style="width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0; z-index:1; display:none;"></video>
        <video id="local-video" autoplay muted playsinline style="width:120px; height:160px; object-fit:cover; position:absolute; bottom:20px; right:20px; z-index:2; border-radius:12px; display:none; border: 2px solid var(--glass-border); box-shadow: 0 8px 32px rgba(0,0,0,0.3);"></video>
        
        <div id="call-ui" style="position:relative; z-index:3; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; width:100%; pointer-events:none;">
          <div id="call-avatar" class="call-avatar">A</div>
          <h2 id="call-name" style="font-size: 32px; margin-bottom: 8px;">Имя</h2>
          <p id="call-status" style="color: rgba(255,255,255,0.7); font-size: 18px; margin-bottom: 64px;">Звонок...</p>
          <div style="display: flex; gap: 40px; margin-top: 20px; pointer-events:auto;">
            <button class="call-btn end" id="call-end-btn"><i class="fas fa-phone-slash"></i></button>
            <button class="call-btn accept" id="call-accept-btn" style="display: none;"><i class="fas fa-phone"></i></button>
          </div>
        </div>
      </div>
    </div>

    <div id="context-backdrop" class="context-backdrop"></div>
    <div id="context-menu" class="context-menu"></div>

    <nav class="bottom-nav glass-panel">
        <div class="nav-item active" id="nav-chats">
          <i class="fas fa-comment"></i>
          <span>Чаты</span>
        </div>
        <div class="nav-item" id="nav-calls">
          <i class="fas fa-phone-alt"></i>
          <span>Звонки</span>
        </div>
        <div class="nav-item" id="nav-settings">
          <i class="fas fa-cog"></i>
          <span>Настройки</span>
        </div>
    </nav>

      <div id="compose-sheet-overlay" class="tg-sheet-overlay">
        <div class="tg-sheet">
          <div class="tg-sheet-header">
            <h4>Написать сообщение</h4>
            <button class="tg-sheet-close" id="compose-close-btn">
              <i class="fas fa-times" style="font-size: 20px;"></i>
            </button>
          </div>
          <div style="padding: 0 15px 10px;">
            <input type="text" id="compose-search-input" placeholder="Поиск пользователей..." style="width: 100%; padding: 10px 15px; border-radius: 10px; border: 1px solid var(--glass-border); outline: none; background: rgba(0,0,0,0.2); color: white; font-size: 15px; box-sizing: border-box;">
          </div>
          <div class="tg-action-list" style="margin-top: 0;">
            <div class="tg-action-item" id="btn-new-group">
              <div class="tg-action-icon" style="background: var(--primary-gradient); border-radius: 50%; color: white;">
                <i class="fas fa-users"></i>
              </div>
              <span style="color: white; font-weight: 500;">Создать новую группу</span>
            </div>
            <div class="tg-action-item" id="btn-new-channel">
              <div class="tg-action-icon" style="background: var(--primary-gradient); border-radius: 50%; color: white;">
                <i class="fas fa-bullhorn"></i>
              </div>
              <span style="color: white; font-weight: 500;">Создать новый канал</span>
            </div>
          </div>
          <div style="padding: 10px 15px 5px; font-size: 13px; font-weight: 600; color: var(--text-muted); background: transparent;">
            КОНТАКТЫ
          </div>
          <div id="compose-users-list" style="overflow-y: auto; flex: 1; min-height: 100px; max-height: 300px; display: flex; flex-direction: column;">
          </div>
        </div>
      </div>

      <div id="create-chat-modal" class="modal-overlay">
        <div class="modal-content glass-panel">
          <h3>Новая группа</h3>
          <input type="text" id="modal-chat-title" placeholder="Название группы..." autocomplete="off" style="color: white; background: rgba(0,0,0,0.2);">
          <div class="modal-actions">
            <button id="modal-cancel" class="btn-cancel">Отмена</button>
            <button id="modal-create" class="btn-confirm">Создать</button>
          </div>
        </div>
      </div>

      <div id="confirm-clear-calls-modal" class="modal-overlay">
        <div class="modal-content glass-panel" style="text-align: center;">
          <h3 style="margin-bottom: 16px;">Очистка истории</h3>
          <p style="color: var(--text-muted); margin-bottom: 24px;">Вы точно хотите удалить всю историю звонков?</p>
          <div class="modal-actions">
            <button id="cancel-clear-calls" class="btn-cancel">Отмена</button>
            <button id="confirm-clear-calls" class="btn-confirm" style="background: #ef4444; color: white;">Удалить</button>
          </div>
        </div>
      </div>

      <div id="confirm-delete-chat-modal" class="modal-overlay">
        <div class="modal-content glass-panel" style="text-align: center;">
          <h3 style="margin-bottom: 16px;">Удаление чата</h3>
          <p id="delete-chat-text" style="color: var(--text-muted); margin-bottom: 24px; line-height: 1.5; font-size: 15px;"></p>
          <div class="modal-actions">
            <button id="cancel-delete-chat" class="btn-cancel">Отмена</button>
            <button id="confirm-delete-chat" class="btn-confirm" style="background: #ef4444; color: white;">Удалить</button>
          </div>
        </div>
      </div>

    </div>
  `;
}

// Вспомогательные функции для работы с LocalStorage
const getLocalList = (k: string): string[] => JSON.parse(localStorage.getItem(k) || '[]');
const setLocalList = (k: string, v: string[]) => localStorage.setItem(k, JSON.stringify(v));
const getLocalObj = (k: string): Record<string, any> => JSON.parse(localStorage.getItem(k) || '{}');
const setLocalObj = (k: string, v: Record<string, any>) => localStorage.setItem(k, JSON.stringify(v));

// Переменные состояния для работы с контекстным меню, выделением и хранилищем
let pinnedChats: string[] = [];
let archivedChats: string[] = [];
let deletedChats: string[] = [];
let pinnedMessages: Record<string, any> = {};
let chatToDelete: { id: string, type: 'me' | 'all' } | null = null;

let editingMessageId: string | null = null;
let replyingToMessage: any = null;
let forwardingMessages: any[] = [];
let multiSelectMode = false;
let selectedMessages = new Set<string>();
let onlineUsers = new Set<string>();
let typingTimer: any;
let isCallInitiator = false;
let currentCallStartTime: number | null = null;
let currentOtherUserId: string | null = null;
let callStopwatchInterval: any = null;

function updateCallStopwatch() {
  if (!currentCallStartTime) return;
  const diff = Math.floor((Date.now() - currentCallStartTime) / 1000);
  const m = Math.floor(diff / 60).toString().padStart(2, '0');
  const s = (diff % 60).toString().padStart(2, '0');
  const statusEl = document.getElementById('call-status');
  if (statusEl) statusEl.innerText = `${m}:${s}`;
}

// --- ОБРАБОТКА ВХОДЯЩИХ СООБЩЕНИЙ В РЕАЛЬНОМ ВРЕМЕНИ ---
export function handleIncomingMessage(newMsg: any) {
  if (processedNotifications.has(newMsg.id)) return;
  processedNotifications.add(newMsg.id);

  if (newMsg.chat_id !== currentChatId && newMsg.sender_id !== myUserId) {
      const states = getLocalObj(`chatStates_${myUserId!}`);
      if (!states[newMsg.chat_id]) states[newMsg.chat_id] = { unread: 0 };
      states[newMsg.chat_id].unread += 1;
      setLocalObj(`chatStates_${myUserId!}`, states);
      
      if (localStorage.getItem('notifications_enabled') === 'true') {
         const audio = new Audio('https://actions.google.com/sounds/v1/communications/pop_up_alert.ogg');
         audio.play().catch(() => {});
      }
  } else if (newMsg.chat_id === currentChatId && newMsg.sender_id !== myUserId) {
      appendMessageHTML(newMsg, false);
      updateChatHeaderStatus();
  }
  
  loadChats(false, false, newMsg);
}

// --- ЗВОНКИ (WebRTC) ---
const rtcConfig = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

export function cleanupCall() {
  if (isCallInitiator && currentOtherUserId) {
    const duration = currentCallStartTime ? Math.round((Date.now() - currentCallStartTime) / 1000) : 0;
    supabase.from('calls').insert({
      caller_id: myUserId!,
      receiver_id: currentOtherUserId!,
      duration: duration,
      call_type: callType
    }).then(({error}) => {
      if (error) console.error("Ошибка сохранения звонка:", error);
      if (document.getElementById('calls-view')?.style.display !== 'none') loadCalls();
    });
  }
  isCallInitiator = false;
  currentCallStartTime = null;
  clearInterval(callStopwatchInterval);

  if (pc) { pc.close(); pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (remoteStream) { remoteStream.getTracks().forEach(t => t.stop()); remoteStream = null; }
  document.getElementById('call-modal')!.classList.remove('active');
  document.getElementById('remote-video')!.style.display = 'none';
  document.getElementById('local-video')!.style.display = 'none';
  document.getElementById('call-avatar')!.style.display = 'flex';
  pendingOffer = null;
}

export async function setupWebRTC(isCaller: boolean) {
  pc = new RTCPeerConnection(rtcConfig);
  
  pc.onicecandidate = (e) => {
    if (e.candidate && currentRoomChannel) {
      currentRoomChannel.send({ type: 'broadcast', event: 'webrtc-ice', payload: e.candidate });
    }
  };
  
  pc.ontrack = (e) => {
    const remoteVid = document.getElementById('remote-video') as HTMLVideoElement;
    if (remoteVid.srcObject !== e.streams[0]) { remoteVid.srcObject = e.streams[0]; remoteStream = e.streams[0]; }
  };
  
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true });
    (document.getElementById('local-video') as HTMLVideoElement).srcObject = localStream;
    localStream.getTracks().forEach(t => pc!.addTrack(t, localStream!));
  } catch (err) { alert("Не удалось получить доступ к камере или микрофону."); }
  
  if (isCaller) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    currentRoomChannel?.send({ type: 'broadcast', event: 'webrtc-offer', payload: { offer, type: callType, caller: myUsername } });
  }
}

function formatLastSeen(dateStr: string | null) {
  if (!dateStr) return 'Был(а) недавно';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Был(а) только что';
  if (diffMins < 60) return `Был(а) ${diffMins} мин. назад`;
  
  const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Был(а) сегодня в ${timeStr}`;
  if (isYesterday) return `Был(а) вчера в ${timeStr}`;
  return `Был(а) ${date.toLocaleDateString()} в ${timeStr}`;
}

export function openForwardModal() {
  document.getElementById('forward-modal')?.classList.add('active');
  loadChats(false, true); 
}

export function bindContextMenu(el: HTMLElement, data: any, type: 'chat' | 'message') {
  let pressTimer: number;
  
  const showMenu = (e: MouseEvent | TouchEvent, x: number, y: number) => {
    if (e.cancelable) e.preventDefault(); // Защита от вызова системного меню на телефоне
    if (multiSelectMode && type === 'message') return; 
    
    const ctxMenu = document.getElementById('context-menu')!;
    const backdrop = document.getElementById('context-backdrop');
    const bubble = el.closest('.message-row')?.querySelector('.message-bubble') as HTMLElement || el;

    ctxMenu.innerHTML = '';
    
    if (type === 'chat') {
      const isPinned = pinnedChats.includes(data.id);
      const isArchived = archivedChats.includes(data.id);
      
      ctxMenu.innerHTML += `<div class="context-menu-item" id="ctx-chat-pin">${isPinned ? 'Открепить' : 'Закрепить'}</div>`;
      ctxMenu.innerHTML += `<div class="context-menu-item" id="ctx-chat-archive">${isArchived ? 'Вернуть из архива' : 'В архив'}</div>`;
      ctxMenu.innerHTML += `<div class="context-menu-item danger" id="ctx-chat-delme">Удалить у меня</div>`;
      ctxMenu.innerHTML += `<div class="context-menu-item danger" id="ctx-chat-delall">Удалить у всех</div>`;
    } else {
      const isMine = data.sender_id === myUserId;
      const isPinned = currentChatId ? (pinnedMessages[currentChatId]?.id === data.id) : false;

      if (isMine && !data.text.startsWith('{')) {
        ctxMenu.innerHTML += `<div class="context-menu-item" id="ctx-msg-edit">Редактировать</div>`;
      }
      ctxMenu.innerHTML += `<div class="context-menu-item" id="ctx-msg-reply">Ответить</div>`;
      ctxMenu.innerHTML += `<div class="context-menu-item" id="ctx-msg-copy">Скопировать</div>`;
      ctxMenu.innerHTML += `<div class="context-menu-item" id="ctx-msg-fwd">Переслать</div>`;
      ctxMenu.innerHTML += `<div class="context-menu-item" id="ctx-msg-pin">${isPinned ? 'Открепить' : 'Закрепить'}</div>`;
      ctxMenu.innerHTML += `<div class="context-menu-item" id="ctx-msg-select">Выбрать несколько</div>`;
      
      // TELEGRAM ЭФФЕКТ ТОЛЬКО ДЛЯ СООБЩЕНИЙ
      bubble.classList.add('context-active');
      backdrop?.classList.add('active');
    }

    // РЕШЕНИЕ БАГА: Правильный показ с очисткой старых стилей
    ctxMenu.style.display = 'block'; 
    ctxMenu.style.visibility = 'hidden'; // Прячем на микросекунду для просчета высоты
    const menuHeight = ctxMenu.offsetHeight || 220; 
    let calculatedTop = y - menuHeight - 15; 
    if (calculatedTop < 20) calculatedTop = y + 20; 

    ctxMenu.style.left = Math.max(10, Math.min(x - 100, window.innerWidth - 210)) + 'px';
    ctxMenu.style.top = calculatedTop + 'px';
    ctxMenu.style.visibility = 'visible'; // Возвращаем видимость
    ctxMenu.classList.add('active');

    // ЖЕСТКОЕ ЗАКРЫТИЕ: Убиваем окно на 100%
    const forceClose = () => {
      ctxMenu.style.display = 'none'; // ПРИНУДИТЕЛЬНО УБИРАЕМ
      ctxMenu.classList.remove('active');
      backdrop?.classList.remove('active');
      bubble.classList.remove('context-active');
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('touchstart', closeMenu);
    };

    const closeMenu = (event?: any) => {
      if (event && ctxMenu.contains(event.target)) return; 
      forceClose();
    };

    // Даем браузеру паузу, чтобы он не закрыл меню сразу при открытии
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('touchstart', closeMenu);
    }, 50);

    // --- ОБРАБОТЧИКИ НАЖАТИЙ (с моментальным закрытием forceClose) ---
    document.getElementById('ctx-chat-pin')?.addEventListener('click', (e) => {
      e.stopPropagation(); forceClose();
      if (pinnedChats.includes(data.id)) pinnedChats = pinnedChats.filter(id => id !== data.id);
      else if (pinnedChats.length < 3) pinnedChats.push(data.id);
      setLocalList(`pinnedChats_${myUserId!}`, pinnedChats); loadChats(); 
    });
    
    document.getElementById('ctx-chat-archive')?.addEventListener('click', (e) => {
      e.stopPropagation(); forceClose();
      if (archivedChats.includes(data.id)) archivedChats = archivedChats.filter(id => id !== data.id);
      else archivedChats.push(data.id);
      setLocalList(`archivedChats_${myUserId!}`, archivedChats); loadChats(); 
    });
    
    // Вызов модальных окон для удаления
    document.getElementById('ctx-chat-delme')?.addEventListener('click', (e) => {
      e.stopPropagation(); forceClose();
      chatToDelete = { id: data.id, type: 'me' };
      document.getElementById('delete-chat-text')!.innerHTML = 'Вы точно хотите удалить <b>у себя</b> переписку?';
      document.getElementById('confirm-delete-chat-modal')?.classList.add('active');
    });
    
    document.getElementById('ctx-chat-delall')?.addEventListener('click', (e) => {
      e.stopPropagation(); forceClose();
      chatToDelete = { id: data.id, type: 'all' };
      document.getElementById('delete-chat-text')!.innerHTML = 'Вы точно хотите удалить переписку <b>у обоих</b> пользователей?';
      document.getElementById('confirm-delete-chat-modal')?.classList.add('active');
    });

    document.getElementById('ctx-msg-edit')?.addEventListener('click', (e) => {
      e.stopPropagation(); forceClose();
      editingMessageId = data.id;
      const messageTextInput = document.getElementById('message-text') as HTMLInputElement;
      messageTextInput.value = typeof data.parsedText === 'object' ? data.parsedText.text : data.text;
      messageTextInput.focus(); 
    });
    
    document.getElementById('ctx-msg-reply')?.addEventListener('click', (e) => { e.stopPropagation(); forceClose(); replyingToMessage = data; showReplyBanner(); });
    document.getElementById('ctx-msg-copy')?.addEventListener('click', (e) => { e.stopPropagation(); forceClose(); navigator.clipboard.writeText(typeof data.parsedText === 'object' ? data.parsedText.text : data.text); });
    document.getElementById('ctx-msg-fwd')?.addEventListener('click', (e) => { e.stopPropagation(); forceClose(); forwardingMessages = [data]; openForwardModal(); });
    
    document.getElementById('ctx-msg-pin')?.addEventListener('click', (e) => {
      e.stopPropagation(); forceClose();
      const chatId = currentChatId!;
      if (pinnedMessages[chatId]?.id === data.id) delete pinnedMessages[chatId];
      else pinnedMessages[chatId] = data;
      setLocalObj(`pinnedMessages_${myUserId!}`, pinnedMessages); renderPinnedBanner(); 
    });
    
    document.getElementById('ctx-msg-select')?.addEventListener('click', (e) => {
      e.stopPropagation(); forceClose();
      multiSelectMode = true; selectedMessages.clear(); selectedMessages.add(data.id);
      document.getElementById('chat-header-container')?.classList.add('multi-select-mode');
      if (currentChatId) loadMessages(currentChatId!); 
    });
  };

  el.addEventListener('contextmenu', (e) => showMenu(e, e.clientX, e.clientY));
  el.addEventListener('touchstart', (e) => {
    pressTimer = window.setTimeout(() => {
      showMenu(e, e.touches[0].clientX, e.touches[0].clientY);
    }, 400); 
  }, { passive: true });
  
  el.addEventListener('touchend', () => {
    clearTimeout(pressTimer);
  });
  
  el.addEventListener('touchmove', () => clearTimeout(pressTimer));
}

export async function setupChat(session: any) {
  myUserId = session.user.id;
  
  document.getElementById('profile-email')!.innerText = session.user.email;
  
  if (session.user.user_metadata?.username) {
    myUsername = session.user.user_metadata.username;
  }

  const { data: profile } = await supabase.from('profiles').select('username').eq('id', myUserId!).single();
  if (profile && profile.username) {
    myUsername = profile.username;
  } else {
    await supabase.from('profiles').upsert([{ id: myUserId!, username: myUsername }]);
  }
  
  document.getElementById('profile-username')!.innerText = myUsername;
  document.getElementById('profile-username-handle')!.innerText = '@' + myUsername;

  pinnedChats = getLocalList(`pinnedChats_${myUserId!}`);
  archivedChats = getLocalList(`archivedChats_${myUserId!}`);
  deletedChats = getLocalList(`deletedChats_${myUserId!}`);
  pinnedMessages = getLocalObj(`pinnedMessages_${myUserId!}`);

  const profileData = JSON.parse(localStorage.getItem(`profile_${myUserId!}`) || '{}');
  const avatarUrl = profileData.avatarUrl || '';
  const avatarBg = profileData.avatarBg || '#8a2be2';

  const updateAvatarUI = (url: string, bg: string, char: string) => {
    const avatars = document.querySelectorAll('.settings-avatar, #ro-avatar-container, #zoomed-avatar-container') as NodeListOf<HTMLDivElement>;
    avatars.forEach(av => {
      if (url) {
        av.style.background = `url('${url}') center/cover`;
        av.innerText = '';
      } else {
        av.style.background = bg;
        av.innerText = char.toUpperCase();
        av.style.display = 'flex';
        av.style.alignItems = 'center';
        av.style.justifyContent = 'center';
        av.style.color = 'white';
      }
    });
  };
  updateAvatarUI(avatarUrl, avatarBg, myUsername.charAt(0));

  const editBtn = document.querySelector('.settings-edit-btn');
  const editModal = document.getElementById('edit-profile-modal');
  editBtn?.addEventListener('click', () => {
    (document.getElementById('edit-avatar-url') as HTMLInputElement).value = profileData.avatarUrl || '';
    const descInput = document.getElementById('edit-description') as HTMLInputElement | null;
    if (descInput) descInput.value = profileData.description || '';
    editModal?.classList.add('active');
  });

  document.getElementById('edit-cancel')?.addEventListener('click', () => editModal?.classList.remove('active'));
  document.getElementById('edit-save')?.addEventListener('click', async () => {
    const editSaveBtn = document.getElementById('edit-save') as HTMLButtonElement;
    editSaveBtn.innerText = 'Загрузка...';
    editSaveBtn.disabled = true;

    // Сначала проверим, загрузил ли человек файл
    const fileInput = document.getElementById('edit-avatar-file') as HTMLInputElement;
    let finalAvatarUrl = (document.getElementById('edit-avatar-url') as HTMLInputElement).value.trim();

    if (fileInput.files && fileInput.files.length > 0) {
       const file = fileInput.files[0];
       const fileExt = file.name.split('.').pop();
       const filePath = `${myUserId}-${Math.random()}.${fileExt}`;
       
       // Грузим в Supabase Storage (в ведро avatars)
       const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file);
       if (!uploadError) {
          const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
          finalAvatarUrl = data.publicUrl; // Получаем публичную ссылку на картинку!
       }
    }

    profileData.avatarUrl = finalAvatarUrl;
    profileData.avatarBg = '#8a2be2'; // сбрасываем цвет
    const newDesc = (document.getElementById('edit-description') as HTMLInputElement).value.trim();
    profileData.description = newDesc || 'Не указано';

    localStorage.setItem(`profile_${myUserId!}`, JSON.stringify(profileData));
    updateAvatarUI(profileData.avatarUrl, profileData.avatarBg, myUsername.charAt(0));
    
    await supabase.from('profiles').update({
      avatar_url: profileData.avatarUrl,
      description: profileData.description
    }).eq('id', myUserId!);

    editSaveBtn.innerText = 'Сохранить';
    editSaveBtn.disabled = false;
    editModal?.classList.remove('active');
  });

  const userTopic = `user_${myUserId!}`;
  const existingUserChannel = supabase.getChannels().find(c => c.topic === userTopic || c.topic === `realtime:${userTopic}`);
  if (existingUserChannel) await supabase.removeChannel(existingUserChannel);

  supabase.channel(userTopic)
    .on('broadcast', { event: 'notification' }, (payload: any) => {
      handleIncomingMessage(payload.payload);
    }).subscribe();

  const updateLastSeen = async () => {
    await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', myUserId!);
  };
  updateLastSeen();
  setInterval(updateLastSeen, 60000); 

  const settingsAvatar = document.querySelector('.settings-avatar') as HTMLDivElement;
  const avatarZoomModal = document.getElementById('avatar-zoom-modal');
  settingsAvatar.style.cursor = 'pointer';
  settingsAvatar.addEventListener('click', () => avatarZoomModal?.classList.add('active'));
  document.getElementById('avatar-zoom-close')?.addEventListener('click', () => avatarZoomModal?.classList.remove('active'));
  document.getElementById('avatar-download-btn')?.addEventListener('click', () => {
    const url = profileData.avatarUrl || `https://ui-avatars.com/api/?name=${myUsername.charAt(0)}&background=${(profileData.avatarBg || '#8a2be2').replace('#','')}&color=fff&size=500`;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'avatar.png';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  const subviewProfile = document.getElementById('subview-profile');
  document.getElementById('btn-my-profile')?.addEventListener('click', () => {
    document.getElementById('ro-username')!.innerText = myUsername;
    document.getElementById('ro-email')!.innerText = session.user.email;
    document.getElementById('ro-description')!.innerText = profileData.description || 'Не указано';
    document.getElementById('ro-birthdate')!.innerText = profileData.birthdate || 'Не указана';
    subviewProfile?.classList.add('active');
  });
  document.getElementById('back-from-profile')?.addEventListener('click', () => subviewProfile?.classList.remove('active'));

  const subviewArchive = document.getElementById('subview-archive');
  document.getElementById('btn-archive')?.addEventListener('click', () => {
    subviewArchive?.classList.add('active');
    loadChats(true);
  });
  document.getElementById('back-from-archive')?.addEventListener('click', () => { subviewArchive?.classList.remove('active'); loadChats(); });

  const subviewNotifications = document.getElementById('subview-notifications');
  document.getElementById('btn-notifications')?.addEventListener('click', () => subviewNotifications?.classList.add('active'));
  document.getElementById('back-from-notifications')?.addEventListener('click', () => subviewNotifications?.classList.remove('active'));

  document.getElementById('back-from-other-profile')?.addEventListener('click', () => {
    document.getElementById('subview-other-profile')?.classList.remove('active');
  });

  const notifToggle = document.getElementById('toggle-notifications') as HTMLInputElement;
  notifToggle.checked = localStorage.getItem('notifications_enabled') === 'true';
  notifToggle.addEventListener('change', (e) => {
    localStorage.setItem('notifications_enabled', (e.target as HTMLInputElement).checked.toString());
  });

  const navChats = document.getElementById('nav-chats');
  const navCalls = document.getElementById('nav-calls');
  const navSettings = document.getElementById('nav-settings');
  
  const sidebarView = document.getElementById('sidebar-view');
  const viewChatsMain = document.getElementById('chats-main-view');
  const viewCalls = document.getElementById('calls-view');
  const viewSettings = document.getElementById('settings-view');

  function switchTab(activeNav: HTMLElement | null, activeView: HTMLElement | null) {
    navChats?.classList.remove('active');
    navCalls?.classList.remove('active');
    navSettings?.classList.remove('active');
    
    viewChatsMain!.style.display = 'none';
    viewCalls!.style.display = 'none';
    viewSettings!.style.display = 'none';
    
    activeNav?.classList.add('active');
    
    const bottomNav = document.querySelector('.bottom-nav') as HTMLElement;

    if (window.innerWidth <= 960) {
      if (bottomNav) bottomNav.style.display = 'flex'; 
      if (activeView === viewChatsMain && !currentChatId) {
        sidebarView!.style.display = 'flex';
        viewChatsMain!.style.display = 'none'; 
        currentChatId = null; 
        document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
        document.querySelector('.app-container')?.classList.remove('chat-active');
      } else {
        sidebarView!.style.display = 'none';
        activeView!.style.display = 'flex';
        if (activeView === viewChatsMain) {
          document.querySelector('.app-container')?.classList.add('chat-active');
        } else {
          document.querySelector('.app-container')?.classList.remove('chat-active');
        }
      }
    } else {
      if (bottomNav) bottomNav.style.display = 'flex';
      sidebarView!.style.display = 'flex';
      activeView!.style.display = 'flex';
    }
  }

  navChats?.addEventListener('click', () => switchTab(navChats, viewChatsMain));
  navCalls?.addEventListener('click', () => { 
    switchTab(navCalls, viewCalls);
    loadCalls();
  });
  navSettings?.addEventListener('click', () => switchTab(navSettings, viewSettings));

  document.getElementById('mobile-back-btn')?.addEventListener('click', () => {
      currentChatId = null;
      document.getElementById('chats-main-view')!.style.display = 'none';
      document.getElementById('sidebar-view')!.style.display = 'flex';
      const bottomNav = document.querySelector('.bottom-nav') as HTMLElement;
      if (bottomNav) bottomNav.style.display = 'flex'; 
      document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
      document.querySelector('.app-container')?.classList.remove('chat-active');
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    if(confirm('Точно выйти из аккаунта?')) supabase.auth.signOut();
  });

  const composeBtn = document.getElementById('compose-btn');
  const modal = document.getElementById('create-chat-modal');
  const modalInput = document.getElementById('modal-chat-title') as HTMLInputElement;
  const modalCancel = document.getElementById('modal-cancel');
  const modalCreate = document.getElementById('modal-create');
  const sendMessageBtn = document.getElementById('send-message-btn');
  const messageTextInput = document.getElementById('message-text') as HTMLInputElement;
  const addUserBtn = document.getElementById('add-user-btn');

  // --- ЛОГИКА ОКНА УДАЛЕНИЯ ЗВОНКОВ ---
  document.getElementById('clear-calls-btn')?.addEventListener('click', () => {
    document.getElementById('confirm-clear-calls-modal')?.classList.add('active');
  });
  
  document.getElementById('cancel-clear-calls')?.addEventListener('click', () => {
    document.getElementById('confirm-clear-calls-modal')?.classList.remove('active');
  });
  
  document.getElementById('confirm-clear-calls')?.addEventListener('click', async () => {
    if (!myUserId) return;
    await supabase.from('calls').delete().or(`caller_id.eq.${myUserId},receiver_id.eq.${myUserId}`);
    document.getElementById('confirm-clear-calls-modal')?.classList.remove('active');
    loadCalls();
  });

  // --- ЛОГИКА ОКНА УДАЛЕНИЯ ЧАТА ---
  document.getElementById('cancel-delete-chat')?.addEventListener('click', () => {
    document.getElementById('confirm-delete-chat-modal')?.classList.remove('active');
    chatToDelete = null;
  });
  
  document.getElementById('confirm-delete-chat')?.addEventListener('click', async () => {
    if (!chatToDelete) return;
    if (chatToDelete.type === 'me') {
      deletedChats.push(chatToDelete.id); 
      setLocalList(`deletedChats_${myUserId!}`, deletedChats); 
    } else if (chatToDelete.type === 'all') {
      await supabase.from('chats').delete().eq('id', chatToDelete.id); 
    }
    loadChats();
    if (currentChatId === chatToDelete.id) { 
      currentChatId = null; 
      document.getElementById('chat-header-container')!.style.display = 'none'; 
      document.getElementById('no-chat-selected')!.style.display = 'flex'; 
    }
    document.getElementById('confirm-delete-chat-modal')?.classList.remove('active');
    chatToDelete = null;
  });

  await loadChats();

  const composeSheet = document.getElementById('compose-sheet-overlay');
  const composeCloseBtn = document.getElementById('compose-close-btn');
  const composeSearchInput = document.getElementById('compose-search-input') as HTMLInputElement;
  const btnNewGroup = document.getElementById('btn-new-group');
  const btnNewChannel = document.getElementById('btn-new-channel');

  const ctxMenu = document.getElementById('context-menu')!;
  document.addEventListener('click', (e) => {
    if (!ctxMenu.contains(e.target as Node)) ctxMenu.classList.remove('active');
  });

  document.getElementById('multi-cancel-btn')?.addEventListener('click', () => {
    multiSelectMode = false; selectedMessages.clear();
    document.getElementById('chat-header-container')?.classList.remove('multi-select-mode');
    if (currentChatId) loadMessages(currentChatId!);
  });
  document.getElementById('multi-delete-btn')?.addEventListener('click', async () => {
    const type = confirm('Удалить у всех? (Отмена - только у меня)') ? 'all' : 'me';
    if (type === 'all') await supabase.from('messages').delete().in('id', Array.from(selectedMessages));
    document.getElementById('multi-cancel-btn')?.click();
  });
  document.getElementById('multi-forward-btn')?.addEventListener('click', () => {
     alert('Выберите чат для пересылки (логика ниже)');
  });

  const callModal = document.getElementById('call-modal')!;
  const startCall = async (type: 'audio'|'video') => {
    if (!currentChatId) return;
    callType = type;
    isCallInitiator = true;
    currentCallStartTime = null;
    document.getElementById('call-name')!.innerText = document.getElementById('active-chat-title')!.innerText;
    document.getElementById('call-avatar')!.innerHTML = document.getElementById('active-chat-avatar')!.innerHTML;
    document.getElementById('call-avatar')!.style.background = document.getElementById('active-chat-avatar')!.style.background;
    document.getElementById('call-status')!.innerText = type === 'video' ? 'Видеозвонок...' : 'Звонок...';
    document.getElementById('call-accept-btn')!.style.display = 'none';
    document.getElementById('remote-video')!.style.display = 'none';
    document.getElementById('local-video')!.style.display = 'none';
    document.getElementById('call-avatar')!.style.display = 'flex';
    callModal.classList.add('active');
    
    await setupWebRTC(true);
  };
  
  document.getElementById('call-btn')?.addEventListener('click', () => startCall('audio'));
  document.getElementById('video-call-btn')?.addEventListener('click', () => startCall('video'));
  
  document.getElementById('call-end-btn')?.addEventListener('click', () => {
    currentRoomChannel?.send({ type: 'broadcast', event: 'webrtc-end', payload: {} });
    cleanupCall();
  });
  document.getElementById('call-accept-btn')?.addEventListener('click', async () => {
    document.getElementById('call-accept-btn')!.style.display = 'none';
    document.getElementById('call-status')!.innerText = 'Соединение...';
    
    await setupWebRTC(false);
    await pc!.setRemoteDescription(new RTCSessionDescription(pendingOffer));
    const answer = await pc!.createAnswer();
    await pc!.setLocalDescription(answer);
    
    currentRoomChannel?.send({ type: 'broadcast', event: 'webrtc-answer', payload: answer });
    
    document.getElementById('call-status')!.innerText = 'На связи';
    document.getElementById('call-avatar')!.style.display = 'none';
    document.getElementById('remote-video')!.style.display = 'block';
    document.getElementById('local-video')!.style.display = 'block';
    
    currentCallStartTime = Date.now();
    clearInterval(callStopwatchInterval);
    updateCallStopwatch();
    callStopwatchInterval = setInterval(updateCallStopwatch, 1000);
  });

  document.getElementById('btn-favorites')?.addEventListener('click', async () => {
    if (!myUserId) return;
    const { data: myMembers } = await supabase.from('chat_members').select('chat_id').eq('user_id', myUserId!);
    const myChatIds = myMembers?.map((m: any) => m.chat_id) || [];
    
    let favChatId = null;
    if (myChatIds.length > 0) {
      const { data: chats } = await supabase.from('chats').select('id, title').in('id', myChatIds).eq('title', 'Избранное').eq('is_group', false);
      if (chats && chats.length > 0) favChatId = chats[0].id;
    }
    
    if (!favChatId) {
      const { data: newChat, error } = await supabase.from('chats').insert([{ title: 'Избранное', is_group: false }]).select().single();
      if (!error && newChat) {
        await supabase.from('chat_members').insert([{ chat_id: newChat.id, user_id: myUserId! }]);
        favChatId = newChat.id;
      }
    }
    
    if (favChatId) {
      switchTab(navChats, viewChatsMain);
      await loadChats();
      
      document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
      const chatElement = document.getElementById(`chat-item-${favChatId}`);
      if (chatElement) chatElement.classList.add('active');
      
      selectChat(favChatId, 'Избранное');
    }
  });

  composeBtn?.addEventListener('click', () => {
    composeSheet?.classList.add('active');
    if (composeSearchInput) composeSearchInput.value = '';
    loadContactsForCompose();
  });

  composeCloseBtn?.addEventListener('click', () => {
    composeSheet?.classList.remove('active');
  });

  composeSearchInput?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.trim();
    if (query) searchUsersForCompose(query);
    else loadContactsForCompose();
  });

  btnNewGroup?.addEventListener('click', () => {
    composeSheet?.classList.remove('active');
    modal?.classList.add('active'); 
    modalInput.focus();
  });

  btnNewChannel?.addEventListener('click', () => {
    alert('Функция создания канала в разработке');
  });

  // --- МОДАЛКА СОЗДАНИЯ ГРУППОВОГО ЧАТА ---
  modalCancel?.addEventListener('click', () => { modal?.classList.remove('active'); modalInput.value = ''; });

  const handleCreateChat = async () => {
    const title = modalInput.value.trim();
    if (!title) return;
    try {
      const { data: chat, error: chatError } = await supabase.from('chats').insert([{ title, is_group: true }]).select().single();
      if (chatError) throw chatError;
      const { error: memberError } = await supabase.from('chat_members').insert([{ chat_id: chat.id, user_id: myUserId! }]);
      if (memberError) throw memberError;
      modal?.classList.remove('active');
      modalInput.value = '';
      await loadChats();
    } catch (error: any) { alert('Ошибка: ' + error.message); }
  };
  modalCreate?.addEventListener('click', handleCreateChat);
  modalInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleCreateChat(); });

  document.getElementById('forward-cancel')?.addEventListener('click', () => {
     forwardingMessages = []; document.getElementById('forward-modal')?.classList.remove('active');
  });

  addUserBtn?.addEventListener('click', async () => {
    if (!currentChatId) return;
    const targetUsername = prompt('Введите username пользователя для добавления:');
    if (!targetUsername) return;
    try {
      const { data: user, error: userError } = await supabase.from('profiles').select('id').eq('username', targetUsername).single();
      if (userError || !user) throw new Error('Пользователь не найден');
      const { error: memberError } = await supabase.from('chat_members').insert([{ chat_id: currentChatId!, user_id: user.id }]);
      if (memberError && memberError.code === '23505') throw new Error('Уже в чате');
      else if (memberError) throw memberError;
      alert(`Пользователь добавлен!`);
    } catch (err: any) { alert('Ошибка: ' + err.message); }
  });

  messageTextInput?.addEventListener('input', () => {
    if (currentChatId) {
      supabase.channel(`room_${currentChatId!}`).send({
        type: 'broadcast', event: 'typing', payload: { user_id: myUserId!, username: myUsername }
      });
    }
  });
  messageTextInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
  sendMessageBtn?.addEventListener('click', sendMsg);
  
  async function sendMsg() {
    const text = messageTextInput.value.trim();
    if (!text || (!currentChatId && !pendingDirectChatUserId)) return;
    
    if (editingMessageId) {
      const editedId = editingMessageId;
      editingMessageId = null; 
      messageTextInput.value = ''; 
      
      // 1. Мгновенно меняем текст в самом чате
      const msgBubble = document.getElementById(`msg-${editedId}`)?.querySelector('.message-bubble');
      if (msgBubble) {
         const textSpan = msgBubble.querySelector('span:not(.msg-time)');
         if (textSpan) textSpan.innerHTML = text; 
      }
      
      // --- НОВОЕ: ОБНОВЛЯЕМ ЗАКРЕПЛЕННОЕ СООБЩЕНИЕ ---
      if (currentChatId && pinnedMessages[currentChatId]?.id === editedId) {
         pinnedMessages[currentChatId].text = text;
         // На всякий случай обновляем и распарсенный текст
         try { pinnedMessages[currentChatId].parsedText = JSON.parse(text); } 
         catch(e) { pinnedMessages[currentChatId].parsedText = text; }
         
         setLocalObj(`pinnedMessages_${myUserId!}`, pinnedMessages);
         renderPinnedBanner(); // Сразу перерисовываем шапку с новым текстом
      }
      // -----------------------------------------------
      
      // 2. Отправляем в базу
      await supabase.from('messages').update({ text }).eq('id', editedId);
      return;
    }

    let finalPayload: string = text;
    
    if (replyingToMessage) {
       const payload = {
         type: 'reply',
         author: replyingToMessage.sender_name || 'User',
         origText: typeof replyingToMessage.parsedText === 'object' ? replyingToMessage.parsedText.text : replyingToMessage.text,
         text: text
       };
       finalPayload = JSON.stringify(payload);
       replyingToMessage = null;
       document.getElementById('reply-banner')!.style.display = 'none';
    }

    messageTextInput.value = '';

    let isNewChat = false;
    if (!currentChatId && pendingDirectChatUserId && pendingDirectChatUsername) {
      const { data: chat, error: chatError } = await supabase.from('chats').insert([{ title: pendingDirectChatUsername, is_group: false }]).select().single();
      if (chatError) return console.error('Ошибка создания чата:', chatError);
      
      currentChatId = chat.id;
      currentChatIsGroup = false; // Указываем, что это личный диалог
      await supabase.from('chat_members').insert([
        { chat_id: currentChatId!, user_id: myUserId! },
        { chat_id: currentChatId!, user_id: pendingDirectChatUserId! }
      ]);

      myChatIds.push(currentChatId!);
      currentChatMembersMap[pendingDirectChatUserId!] = { username: pendingDirectChatUsername };
      currentChatMembersMap[myUserId!] = { username: myUsername };

      pendingDirectChatUserId = null;
      pendingDirectChatUsername = null;
      isNewChat = true;
    }
    
    const generateId = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16);
      });
    };
    const msgId = generateId();

    const tempMsg = {
        id: msgId, chat_id: currentChatId!, text: finalPayload,
        sender_id: myUserId!, sender_name: myUsername, created_at: new Date().toISOString()
    };
    appendMessageHTML(tempMsg, true);
    
    currentRoomChannel?.send({ type: 'broadcast', event: 'new_message', payload: tempMsg });
    Object.keys(currentChatMembersMap).forEach(memberId => {
      if (memberId !== myUserId!) {
        supabase.channel(`user_${memberId}`).send({ type: 'broadcast', event: 'notification', payload: tempMsg });
      }
    });
    
    loadChats(false, false, tempMsg); 

    await supabase.from('messages').insert([
      { id: msgId, chat_id: currentChatId!, text: finalPayload, sender_id: myUserId! }
    ]);
    
    if (isNewChat) loadChats();
  }

  // --- ЛОГИКА ОТПРАВКИ ФАЙЛОВ В ЧАТ ---
  const attachBtn = document.getElementById('attach-btn');
  const chatFileInput = document.getElementById('chat-file-input') as HTMLInputElement;

  attachBtn?.addEventListener('click', () => chatFileInput.click()); // Открываем проводник по клику на скрепку

  chatFileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !currentChatId) return;

    // Блокируем инпут, пока грузится файл
    messageTextInput.placeholder = 'Отправка файла...';
    messageTextInput.disabled = true;

    const fileExt = file.name.split('.').pop();
    const filePath = `${currentChatId}/${Date.now()}_${Math.random()}.${fileExt}`;
    
    // Грузим в хранилище Supabase
    const { error: uploadError } = await supabase.storage.from('chat_files').upload(filePath, file);
    
    messageTextInput.placeholder = 'Написать сообщение...';
    messageTextInput.disabled = false;
    chatFileInput.value = ''; // Сбрасываем инпут

    if (uploadError) {
       alert('Ошибка загрузки файла!');
       return;
    }

    // Получаем ссылку на файл
    const { data } = supabase.storage.from('chat_files').getPublicUrl(filePath);
    
    // Формируем JSON-сообщение о файле
    const payload = JSON.stringify({
       type: 'file',
       url: data.publicUrl,
       name: file.name,
       isImage: file.type.startsWith('image/')
    });

    // Отправляем как обычное сообщение!
    messageTextInput.value = payload;
    sendMsg(); 
  });

  const msgTopic = 'messages_channel';
  const existingMsgChannel = supabase.getChannels().find(c => c.topic === msgTopic || c.topic === `realtime:${msgTopic}`);
  if (existingMsgChannel) await supabase.removeChannel(existingMsgChannel);

  supabase
    .channel(msgTopic)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, async (payload: any) => {
      if (payload.eventType === 'INSERT') {
        const newMsg = payload.new;
        
        if (myChatIds.includes(newMsg.chat_id)) {
           handleIncomingMessage(newMsg);
        } else if (newMsg.sender_id !== myUserId!) {
           const { data: member } = await supabase.from('chat_members').select('chat_id').eq('chat_id', newMsg.chat_id).eq('user_id', myUserId!).single();
           if (member) {
               myChatIds.push(newMsg.chat_id);
               handleIncomingMessage(newMsg);
           }
        }
      } else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
         // --- НОВОЕ: ПРОВЕРЯЕМ, НЕ ИЗМЕНИЛИ ЛИ ЗАКРЕПЛЕННОЕ СООБЩЕНИЕ ---
         if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new;
            if (pinnedMessages[updatedMsg.chat_id] && pinnedMessages[updatedMsg.chat_id].id === updatedMsg.id) {
               pinnedMessages[updatedMsg.chat_id].text = updatedMsg.text;
               try { 
                   pinnedMessages[updatedMsg.chat_id].parsedText = JSON.parse(updatedMsg.text); 
               } catch(e) { 
                   pinnedMessages[updatedMsg.chat_id].parsedText = updatedMsg.text; 
               }
               setLocalObj(`pinnedMessages_${myUserId!}`, pinnedMessages);
            }
         }
         // ---------------------------------------------------------------
         
         if (currentChatId) loadMessages(currentChatId!); // Перезагружаем чат
         loadChats();
      }
    })
    .subscribe();
}

export async function loadContactsForCompose() {
  const composeUsersList = document.getElementById('compose-users-list');
  if (!composeUsersList || !myUserId) return;
  
  composeUsersList.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-muted);">Загрузка...</div>';
  
  const { data: myMembers } = await supabase.from('chat_members').select('chat_id, chats!inner(is_group)').eq('user_id', myUserId!).eq('chats.is_group', false);
  const directChatIds = myMembers?.map((m: any) => m.chat_id) || [];
  
  let users: {id: string, username: string}[] = [];
  
  if (directChatIds.length > 0) {
    const { data: otherMembers } = await supabase
      .from('chat_members')
      .select('user_id, profiles(username)')
      .in('chat_id', directChatIds)
      .neq('user_id', myUserId!);
      
    if (otherMembers) {
       users = otherMembers.map((m: any) => {
         const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
         return {
           id: m.user_id,
           username: profile?.username || 'Пользователь'
         };
       });
    }
  }
  renderComposeUsers(users, true);
}

export async function searchUsersForCompose(query: string) {
  const composeUsersList = document.getElementById('compose-users-list');
  if (!composeUsersList || !myUserId) return;
  
  composeUsersList.innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-muted);">Поиск...</div>';
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .neq('id', myUserId!)
    .ilike('username', `%${query}%`)
    .limit(20);
    
  if (error || !data) {
     renderComposeUsers([], false);
     return;
  }
  renderComposeUsers(data, false);
}

function renderComposeUsers(users: any[], isEmptyContactList: boolean) {
   const composeUsersList = document.getElementById('compose-users-list');
   if (!composeUsersList) return;
   
   composeUsersList.innerHTML = '';
   if (users.length === 0) {
     composeUsersList.innerHTML = `<div style="padding: 15px; text-align: center; color: var(--text-muted);">${isEmptyContactList ? 'Пусто' : 'Ничего не найдено'}</div>`;
     return;
   }
   
   users.forEach(user => {
     const item = document.createElement('div');
     item.className = 'tg-action-item';
     item.style.borderTop = 'none';
     item.innerHTML = `
       <div class="tg-action-icon" style="background: var(--primary-gradient); color: white; border-radius: 50%; font-size: 14px;">
         ${user.username.charAt(0).toUpperCase()}
       </div>
       <span style="color: white; font-weight: 500; margin-left: 12px;">${user.username}</span>
     `;
     item.addEventListener('click', () => selectUserForChat(user.id, user.username));
     composeUsersList.appendChild(item);
   });
}

function updateChatHeaderStatus() {
  const statusEl = document.getElementById('active-chat-status')!;
  const otherUserId = currentOtherUserId;
  if (!otherUserId) {
    statusEl.innerText = ''; return;
  }
  if (onlineUsers.has(otherUserId)) {
    statusEl.innerText = 'в сети';
    statusEl.style.color = 'var(--green-avatar)';
  } else {
    const profile = currentChatMembersMap[otherUserId];
    if (profile && profile.last_seen) {
      statusEl.innerText = formatLastSeen(profile.last_seen);
    } else {
      statusEl.innerText = 'Был(а) недавно';
    }
    statusEl.style.color = 'var(--text-muted)';
  }
}

async function selectUserForChat(targetUserId: string, targetUsername: string) {
  document.getElementById('compose-sheet-overlay')?.classList.remove('active');
  
  if (!myUserId) return;
  
  const { data: myMembers } = await supabase.from('chat_members').select('chat_id, chats!inner(is_group)').eq('user_id', myUserId!).eq('chats.is_group', false);
  const myChatIds = myMembers?.map((m: any) => m.chat_id) || [];
  
  if (myChatIds.length > 0) {
    const { data: targetMembers } = await supabase.from('chat_members').select('chat_id').eq('user_id', targetUserId).in('chat_id', myChatIds);
    if (targetMembers && targetMembers.length > 0 && targetMembers[0].chat_id) {
      document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
      const chatElement = document.getElementById(`chat-item-${targetMembers[0].chat_id}`);
      if (chatElement) chatElement.classList.add('active');
      selectChat(targetMembers[0].chat_id as string, targetUsername);
      return;
    }
  }
  
  currentChatId = null;
  pendingDirectChatUserId = targetUserId;
  pendingDirectChatUsername = targetUsername;
  currentOtherUserId = targetUserId;
  currentChatMembersMap = {}; 
  
  document.getElementById('no-chat-selected')!.style.display = 'none';
  document.getElementById('chat-header-container')!.style.display = 'flex';
  document.getElementById('active-chat-title')!.innerText = targetUsername;
  document.getElementById('messages-list')!.innerHTML = '';
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  
  const addUserBtn = document.getElementById('add-user-btn');
  if (addUserBtn) addUserBtn.style.display = 'none';

  document.getElementById('active-chat-avatar')!.style.background = 'var(--green-avatar)';
  document.getElementById('active-chat-avatar')!.innerText = targetUsername.charAt(0).toUpperCase();
  
  setupOtherUserProfile(targetUserId);

  document.querySelector('.app-container')?.classList.add('chat-active');

  if (window.innerWidth <= 960) {
    document.getElementById('sidebar-view')!.style.display = 'none';
    document.getElementById('chats-main-view')!.style.display = 'flex';
    const bottomNav = document.querySelector('.bottom-nav') as HTMLElement;
    if (bottomNav) bottomNav.style.display = 'none'; 
  }
}

async function loadChats(inArchive: boolean = false, forForwarding: boolean = false, injectedLatestMsg?: any) {
  const chatsList = document.getElementById(forForwarding ? 'forward-chats-list' : (inArchive ? 'archive-list' : 'chats-list'));
  if (!chatsList || !myUserId) return;
  
  const { data: members, error } = await supabase.from('chat_members').select('chat_id, chats(id, title, is_group)').eq('user_id', myUserId!);
  if (error || !members) return console.error(error);
  
  const chatIds = members.map((m: any) => m.chat_id);
  myChatIds = chatIds;
  
  const { data: latestMessages } = await supabase.from('messages').select('chat_id, created_at, text').in('chat_id', chatIds).order('created_at', { ascending: false });
  const latestByChat: Record<string, any> = {};
  if (latestMessages) {
     latestMessages.forEach(msg => {
         if (!latestByChat[msg.chat_id]) latestByChat[msg.chat_id] = msg;
     });
  }
  
  if (injectedLatestMsg) latestByChat[injectedLatestMsg.chat_id] = injectedLatestMsg;

  let visibleChats = members.filter((m: any) => {
     const chat = Array.isArray(m.chats) ? m.chats[0] : m.chats;
     return chat && !deletedChats.includes(chat.id);
  });
  if (!inArchive) visibleChats = visibleChats.filter((m: any) => {
     const chat = Array.isArray(m.chats) ? m.chats[0] : m.chats;
     return !archivedChats.includes(chat.id);
  });
  else visibleChats = visibleChats.filter((m: any) => {
     const chat = Array.isArray(m.chats) ? m.chats[0] : m.chats;
     return archivedChats.includes(chat.id);
  });
  
  visibleChats.sort((a: any, b: any) => {
     const chatA = Array.isArray(a.chats) ? a.chats[0] : a.chats;
     const chatB = Array.isArray(b.chats) ? b.chats[0] : b.chats;
     const aPinned = pinnedChats.includes(chatA.id);
     const bPinned = pinnedChats.includes(chatB.id);
     if (aPinned && !bPinned) return -1;
     if (!aPinned && bPinned) return 1;
     
     const aTime = latestByChat[chatA.id] ? new Date(latestByChat[chatA.id].created_at).getTime() : 0;
     const bTime = latestByChat[chatB.id] ? new Date(latestByChat[chatB.id].created_at).getTime() : 0;
     return bTime - aTime;
  });
  
  const states = getLocalObj(`chatStates_${myUserId!}`);

  chatsList.innerHTML = '';
  
  // ИСПОЛЬЗУЕМ FOR...OF ДЛЯ ПРЯМЫХ ЗАПРОСОВ К КАЖДОМУ ПРОФИЛЮ
  for (const m of visibleChats) {
    const chatObj = Array.isArray(m.chats) ? m.chats[0] : m.chats;
    if (!chatObj) continue;

    let title = chatObj.title || 'Чат';
    let avatarStyle = `background: var(--green-avatar);`;
    let avatarContent = title.charAt(0).toUpperCase();

    if (chatObj.is_group === false) {
      // Узнаем ID второго участника
      const { data: otherMembers } = await supabase.from('chat_members').select('user_id').eq('chat_id', chatObj.id).neq('user_id', myUserId!);
      
      if (otherMembers && otherMembers.length > 0) {
          const otherUserId = otherMembers[0].user_id;
          
          // ИСПОЛЬЗУЕМ '*' ЧТОБЫ ИЗБЕЖАТЬ ОШИБКИ ОТСУТСТВУЮЩИХ КОЛОНОК В БД
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', otherUserId).single();
          
          if (profile) {
              title = profile.username || 'Без имени'; 
              if (profile.avatar_url) {
                 avatarStyle = `background: url('${profile.avatar_url}') center/cover;`;
                 avatarContent = '';
              } else if (profile.avatar_bg) {
                 avatarStyle = `background: ${profile.avatar_bg};`;
                 avatarContent = title.charAt(0).toUpperCase();
              } else {
                 avatarContent = title.charAt(0).toUpperCase();
              }
          } else {
              // Если вдруг всё же не найдет, берем оригинальное название чата, но проверяем чтобы это был не ты
              title = chatObj.title !== myUsername ? chatObj.title : 'Собеседник';
              avatarContent = title.charAt(0).toUpperCase();
          }
      } else {
          title = 'Пустой диалог'; 
          avatarContent = 'П';
      }
    }
    
    let previewText = 'Нажмите чтобы открыть';
    if (latestByChat[chatObj.id]) {
       const rawText = latestByChat[chatObj.id].text;
       try { previewText = JSON.parse(rawText).text || 'Вложение'; } 
       catch(e) { previewText = rawText; }
    }
    
    const unreadCount = states[chatObj.id]?.unread || 0;
    const unreadHtml = unreadCount > 0 ? `<div class="unread-badge">${unreadCount}</div>` : '';

    const li = document.createElement('li');
    li.className = 'chat-item';
    if (currentChatId === chatObj.id) li.classList.add('active');
    li.id = `chat-item-${chatObj.id}`;
    li.innerHTML = `
      <div class="chat-avatar" style="${avatarStyle}">${avatarContent}</div>
      <div class="chat-info">
        <span class="chat-name">${title} ${pinnedChats.includes(chatObj.id) ? '📌' : ''}</span>
        <span class="chat-preview">${previewText}</span>
      </div>
      <div class="chat-meta">${unreadHtml}<i class="fas fa-ellipsis-h" style="margin-top: auto; padding-bottom: 2px;"></i></div>
    `;
    li.addEventListener('click', () => {
      if (forForwarding) { forwardMessagesTo(chatObj.id); return; }
      if (inArchive) { document.getElementById('back-from-archive')?.click(); }
      document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
      li.classList.add('active');
      selectChat(chatObj.id, title);
    });
    if (!forForwarding) bindContextMenu(li, chatObj, 'chat');
    chatsList.appendChild(li);
  }
}

async function selectChat(chatId: string, chatTitle: string) {
  currentChatId = chatId;
  
  const states = getLocalObj(`chatStates_${myUserId!}`);
  if (states[chatId] && states[chatId].unread > 0) {
     states[chatId].unread = 0;
     setLocalObj(`chatStates_${myUserId!}`, states);
     loadChats();
  }

  const { data: chatData } = await supabase.from('chats').select('is_group').eq('id', chatId).single();
  const isGroup = chatData?.is_group === true;
  currentChatIsGroup = isGroup; 
  
  const addUserBtn = document.getElementById('add-user-btn');
  if (addUserBtn) addUserBtn.style.display = isGroup ? 'flex' : 'none';
  
  const { data: membersRaw } = await supabase.from('chat_members').select('user_id').eq('chat_id', chatId);
  currentChatMembersMap = {};
  let otherUser: any = null;
  
  if (membersRaw) {
    const otherMemberId = membersRaw.find(m => m.user_id !== myUserId!)?.user_id;
    if (otherMemberId) {
       // ИСПОЛЬЗУЕМ '*' ЧТОБЫ ИЗБЕЖАТЬ ОШИБКИ
       const { data: profile } = await supabase.from('profiles').select('*').eq('id', otherMemberId).single();
       if (profile) otherUser = profile;
    }
  }

  const titleEl = document.getElementById('active-chat-title')!;
  const avatarEl = document.getElementById('active-chat-avatar')!;
  
  if (!isGroup) {
    if (otherUser) {
        titleEl.innerText = otherUser.username || 'Собеседник';
        currentOtherUserId = otherUser.id;
        setupOtherUserProfile(otherUser.id);
        
        if (otherUser.avatar_url) {
           avatarEl.style.background = `url('${otherUser.avatar_url}') center/cover`;
           avatarEl.innerText = '';
        } else {
           avatarEl.style.background = otherUser.avatar_bg || 'var(--green-avatar)';
           avatarEl.innerText = (otherUser.username || 'U').charAt(0).toUpperCase();
        }
    } else {
        // Запасной план: если профиль всё равно не прогрузился
        titleEl.innerText = chatTitle !== myUsername ? chatTitle : "Собеседник";
        currentOtherUserId = null;
        avatarEl.style.background = 'var(--primary-gradient)';
        avatarEl.innerText = titleEl.innerText.charAt(0).toUpperCase();
    }
  } else {
    titleEl.innerText = chatTitle;
    currentOtherUserId = null;
    avatarEl.style.background = 'var(--primary-gradient)';
    avatarEl.innerText = chatTitle.charAt(0).toUpperCase();
  }
  
  if (otherUser) updateChatHeaderStatus();
  
  if (currentRoomChannel) await supabase.removeChannel(currentRoomChannel);
  
  const roomTopic = `room_${chatId}`;
  const existingRoom = supabase.getChannels().find(c => c.topic === roomTopic || c.topic === `realtime:${roomTopic}`);
  if (existingRoom) await supabase.removeChannel(existingRoom);

  currentRoomChannel = supabase.channel(roomTopic);
  
  currentRoomChannel
    .on('broadcast', { event: 'typing' }, (payload: any) => {
       if (payload.payload.user_id !== myUserId!) {
          const statusEl = document.getElementById('active-chat-status')!;
          statusEl.innerText = 'печатает...';
          statusEl.style.color = '#3b82f6';
          clearTimeout(typingTimer);
          typingTimer = setTimeout(updateChatHeaderStatus, 2000);
       }
    })
    .on('broadcast', { event: 'webrtc-offer' }, async (payload: any) => {
       if (payload.payload.caller !== myUsername) {
         pendingOffer = payload.payload.offer;
         callType = payload.payload.type;
         const callModal = document.getElementById('call-modal')!;
         document.getElementById('call-name')!.innerText = payload.payload.caller;
         document.getElementById('call-status')!.innerText = callType === 'video' ? 'Входящий видеозвонок...' : 'Входящий звонок...';
         document.getElementById('call-accept-btn')!.style.display = 'flex';
         document.getElementById('remote-video')!.style.display = 'none';
         document.getElementById('local-video')!.style.display = 'none';
         document.getElementById('call-avatar')!.style.display = 'flex';
         callModal.classList.add('active');
       }
    })
    .on('broadcast', { event: 'webrtc-answer' }, async (payload: any) => {
       if (pc && pc.signalingState !== 'stable') {
         document.getElementById('call-status')!.innerText = 'Соединение...';
         await pc.setRemoteDescription(new RTCSessionDescription(payload.payload));
         document.getElementById('call-avatar')!.style.display = 'none';
         document.getElementById('remote-video')!.style.display = 'block';
         document.getElementById('local-video')!.style.display = 'block';
         
         currentCallStartTime = Date.now();
         clearInterval(callStopwatchInterval);
         updateCallStopwatch();
         callStopwatchInterval = setInterval(updateCallStopwatch, 1000);
       }
    })
    .on('broadcast', { event: 'webrtc-ice' }, (payload: any) => {
       if (pc) pc.addIceCandidate(new RTCIceCandidate(payload.payload)).catch(e => console.log(e));
    })
    .on('broadcast', { event: 'webrtc-end' }, () => cleanupCall())
    .on('broadcast', { event: 'new_message' }, (payload: any) => {
       handleIncomingMessage(payload.payload);
    })
    // НОВЫЙ БЛОК: СЛУШАЕМ ПРОЧТЕНИЕ СООБЩЕНИЙ
    .on('broadcast', { event: 'messages_read' }, (payload: any) => {
       const readIds = payload.payload.ids;
       readIds.forEach((id: string) => {
          const tickEl = document.getElementById(`ticks-${id}`);
          // Меняем серую галочку на двойную зеленую в реальном времени!
          if (tickEl) tickEl.innerHTML = '<i class="fas fa-check-double read"></i>'; 
       });
    })
    .subscribe();

  document.getElementById('no-chat-selected')!.style.display = 'none';
  document.getElementById('chat-header-container')!.style.display = 'flex';
  await loadMessages(chatId);

  document.querySelector('.app-container')?.classList.add('chat-active');

  if (window.innerWidth <= 960) {
    document.getElementById('sidebar-view')!.style.display = 'none';
    document.getElementById('chats-main-view')!.style.display = 'flex';
    const bottomNav = document.querySelector('.bottom-nav') as HTMLElement;
    if (bottomNav) bottomNav.style.display = 'none'; 
  }
}

document.getElementById('chat-header-info')?.addEventListener('click', () => {
  if (currentOtherUserId) {
    document.getElementById('subview-other-profile')?.classList.add('active');
  }
});

function setupOtherUserProfile(userId: string) {
  const profile = currentChatMembersMap[userId];
  if (!profile) return;
  
  document.getElementById('other-username')!.innerText = profile.username || 'Пользователь';
  document.getElementById('other-description')!.innerText = profile.description || 'Не указано';
  
  const statusEl = document.getElementById('other-status')!;
  if (onlineUsers.has(userId)) { statusEl.innerText = 'В сети'; statusEl.style.color = 'var(--green-avatar)'; }
  else { statusEl.innerText = formatLastSeen(profile.last_seen); statusEl.style.color = 'var(--text-muted)'; }
  
  const avatarEl = document.getElementById('other-avatar-container')!;
  if (profile.avatar_url) {
     avatarEl.style.background = `url('${profile.avatar_url}') center/cover`;
     avatarEl.innerText = '';
  } else {
     avatarEl.style.background = profile.avatar_bg || 'var(--green-avatar)';
     avatarEl.innerText = (profile.username || 'U').charAt(0).toUpperCase();
  }
}

async function loadMessages(chatId: string) {
  const messagesList = document.getElementById('messages-list');
  if (!messagesList) return;
  const { data: messages, error } = await supabase.from('messages').select('id, text, sender_id, created_at, is_read, profiles(username)').eq('chat_id', chatId).order('created_at', { ascending: true });
  if (error) return console.error(error);
  renderedMessageIds.clear(); 
  
  renderPinnedBanner();
  messagesList.innerHTML = '';
  
  const unreadIds: string[] = []; // Собираем ID непрочитанных НАМ чужих сообщений

  messages.forEach((msg: any) => {
    const isMine = msg.sender_id === myUserId!;
    if (!isMine && !msg.is_read) unreadIds.push(msg.id); // Если чужое и не прочитано - в массив

    const profile = Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles;
    msg.sender_name = profile?.username || 'Пользователь';
    appendMessageHTML(msg, isMine);
  });

  // Отмечаем их как прочитанные в базе и отправляем сигнал собеседнику
  if (unreadIds.length > 0) {
     await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
     // Рассылаем событие, чтобы у собеседника галочки мгновенно стали зелеными
     currentRoomChannel?.send({ type: 'broadcast', event: 'messages_read', payload: { ids: unreadIds } });
  }
}

function renderPinnedBanner() {
  const banner = document.getElementById('pinned-message-banner');
  if (!banner) return;
  
  if (!currentChatId) {
     banner.style.display = 'none'; 
     return;
  }
  
  const chatId = currentChatId!;
  const uId = myUserId!;
  
  if (!pinnedMessages || !pinnedMessages[chatId]) {
     banner.style.display = 'none'; 
     return;
  }
  
  const msg = pinnedMessages[chatId];
  const text = typeof msg.parsedText === 'object' ? msg.parsedText.text : msg.text;
  
  banner.innerHTML = `
    <div class="chat-banner-content" onclick="document.getElementById('msg-${msg.id}')?.scrollIntoView({behavior: 'smooth'})">
      <div class="chat-banner-title">Закрепленное сообщение</div>
      <div class="chat-banner-text">${text}</div>
    </div>
    <button class="chat-banner-close" onclick="event.stopPropagation(); delete pinnedMessages['${chatId}']; setLocalObj('pinnedMessages_${uId}', pinnedMessages); document.getElementById('pinned-message-banner').style.display='none';">✖</button>
  `;
  banner.style.display = 'flex';
}

function showReplyBanner() {
  const banner = document.getElementById('reply-banner')!;
  const text = typeof replyingToMessage.parsedText === 'object' ? replyingToMessage.parsedText.text : replyingToMessage.text;
  banner.innerHTML = `
    <div class="chat-banner-content" style="border-left-color: var(--primary);">
      <div class="chat-banner-title">Ответ ${replyingToMessage.sender_name || 'Пользователь'}</div>
      <div class="chat-banner-text">${text}</div>
    </div>
    <button class="chat-banner-close" onclick="replyingToMessage=null; document.getElementById('reply-banner').style.display='none'">✖</button>
  `;
  banner.style.display = 'flex';
}

async function forwardMessagesTo(chatId: string) {
  document.getElementById('forward-modal')?.classList.remove('active');
  const payloadArr = forwardingMessages.map(fMsg => {
     const origText = typeof fMsg.parsedText === 'object' ? fMsg.parsedText.text : fMsg.text;
     return { chat_id: chatId, sender_id: myUserId!, text: JSON.stringify({ type: 'forward', author: fMsg.sender_name || 'User', text: origText }) };
  });
  await supabase.from('messages').insert(payloadArr);
  forwardingMessages = [];
  document.getElementById('multi-cancel-btn')?.click();
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  const chatElement = document.getElementById(`chat-item-${chatId}`);
  if (chatElement) { chatElement.classList.add('active'); selectChat(chatId, chatElement.querySelector('.chat-title')?.textContent || 'Чат'); }
}

function appendMessageHTML(msg: any, isMine: boolean) {
  if (renderedMessageIds.has(msg.id)) return;
  renderedMessageIds.add(msg.id);
  
  const messagesList = document.getElementById('messages-list');
  if (!messagesList) return;
  const dateObj = msg.created_at ? new Date(msg.created_at) : new Date();
  const timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const senderProfile = currentChatMembersMap[msg.sender_id] || {};
  msg.sender_name = msg.sender_name || senderProfile.username || 'Пользователь';
  const avatarBg = senderProfile.avatar_bg || 'var(--green-avatar)';
  const avatarUrl = senderProfile.avatar_url || '';
  const firstLetter = msg.sender_name.charAt(0).toUpperCase();
  const avatarStyle = avatarUrl ? `background: url('${avatarUrl}') center/cover;` : `background: ${avatarBg};`;
  const avatarHtml = !isMine ? `<div class="msg-avatar" style="${avatarStyle}">${avatarUrl ? '' : firstLetter}</div>` : '';

  let parsed: any = null;
  try { parsed = JSON.parse(msg.text); msg.parsedText = parsed; } catch(e) { msg.parsedText = msg.text; }
  
  let contentHtml = '';
  if (parsed && typeof parsed === 'object') {
     if (parsed.type === 'reply') {
        contentHtml = `<div class="quoted-message"><div class="quoted-author">${parsed.author}</div><div class="quoted-text">${parsed.origText}</div></div><span>${parsed.text}</span>`;
     } else if (parsed.type === 'forward') {
        contentHtml = `<div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">Переслано от ${parsed.author}</div><span>${parsed.text}</span>`;
     } else if (parsed.type === 'file') {
        if (parsed.isImage) {
           // ФОТОГРАФИИ БЕЗ ТЕКСТА И С УМЕНЬШЕННЫМИ РАМКАМИ
           contentHtml = `<img src="${parsed.url}" style="max-width: 100%; border-radius: 8px; cursor: pointer; display: block;" onclick="window.open('${parsed.url}', '_blank')">`;
        } else {
           contentHtml = `<a href="${parsed.url}" target="_blank" style="color: #3b82f6; text-decoration: none; display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px;"><i class="fas fa-file-download" style="font-size: 20px;"></i> <span style="word-break: break-all;">${parsed.name}</span></a>`;
        }
     } else {
        contentHtml = `<span>${msg.text}</span>`;
     }
  } else {
     contentHtml = `<span>${msg.text}</span>`;
  }

  // ЛОГИКА ГАЛОЧЕК
  const ticksHtml = isMine 
    ? `<span class="msg-ticks" id="ticks-${msg.id}">${msg.is_read ? '<i class="fas fa-check-double read"></i>' : '<i class="fas fa-check delivered"></i>'}</span>` 
    : '';

  const row = document.createElement('div');
  row.className = `message-row ${isMine ? 'mine' : 'other'}`;
  row.id = `msg-${msg.id}`;
  
  row.innerHTML = `
    <div class="message-checkbox-wrapper">
      <input type="checkbox" class="message-checkbox" value="${msg.id}" ${selectedMessages.has(msg.id) ? 'checked' : ''}>
    </div>
    ${avatarHtml}
    <div class="message-bubble">
      ${(!isMine && currentChatIsGroup) ? `<div class="msg-author">${msg.sender_name}</div>` : ''}
      ${contentHtml}
      <span class="msg-time">${timeString}${ticksHtml}</span>
    </div>
  `;
  
  const checkbox = row.querySelector('.message-checkbox') as HTMLInputElement;
  checkbox?.addEventListener('change', () => {
     if (checkbox.checked) selectedMessages.add(msg.id); else selectedMessages.delete(msg.id);
  });

  bindContextMenu(row.querySelector('.message-bubble') as HTMLElement, msg, 'message');
  messagesList.appendChild(row);
  messagesList.scrollTop = messagesList.scrollHeight;
}

export async function loadCalls() {
  const callsList = document.getElementById('calls-list');
  if (!callsList || !myUserId) return;
  
  callsList.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:20px;">Загрузка...</div>';

  const { data: callsData, error } = await supabase
    .from('calls')
    .select('*')
    .or(`caller_id.eq.${myUserId!},receiver_id.eq.${myUserId!}`)
    .order('started_at', { ascending: false });

  if (error) {
     console.error("Ошибка загрузки звонков:", error);
     callsList.innerHTML = '<div style="text-align:center; color:#ef4444; margin-top:20px;">Ошибка БД</div>';
     return;
  }

  if (!callsData || callsData.length === 0) {
     callsList.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:20px;">Нет истории звонков</div>';
     return;
  }

  // --- НОВАЯ ЛОГИКА ФИЛЬТРАЦИИ (НЕВИДИМОСТЬ) ---
  // Достаем время последней очистки (если мы еще не чистили, время будет 0)
  const clearedAtStr = localStorage.getItem(`clearedCallsAt_${myUserId!}`);
  const clearedTime = clearedAtStr ? new Date(clearedAtStr).getTime() : 0;

  // Оставляем только свежие звонки
  const visibleCalls = callsData.filter((call: any) => {
     return new Date(call.started_at).getTime() > clearedTime;
  });

  if (visibleCalls.length === 0) {
     callsList.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:20px;">Нет истории звонков</div>';
     return;
  }
  // ---------------------------------------------

  const profileIds = new Set<string>();
  visibleCalls.forEach((c: any) => { profileIds.add(c.caller_id); profileIds.add(c.receiver_id); });
  
  // ИСПОЛЬЗУЕМ '*', КАК МЫ ЭТО СДЕЛАЛИ В ЧАТАХ
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', Array.from(profileIds));
  const profilesMap: Record<string, any> = {};
  profiles?.forEach((p: any) => profilesMap[p.id] = p);

  callsList.innerHTML = '';
  // Отрисовываем только видимые (visibleCalls), а не все (callsData)
  visibleCalls.forEach((call: any) => {
     const isOutgoing = call.caller_id === myUserId!;
     const otherUserId = isOutgoing ? call.receiver_id : call.caller_id;
     const profile = profilesMap[otherUserId];
     
     const title = profile?.username || 'Собеседник';
     const avatarBg = profile?.avatar_bg || 'var(--green-avatar)';
     const avatarUrl = profile?.avatar_url || '';
     const avatarStyle = avatarUrl ? `background: url('${avatarUrl}') center/cover;` : `background: ${avatarBg};`;
     const avatarContent = avatarUrl ? '' : title.charAt(0).toUpperCase();

     const date = new Date(call.started_at).toLocaleString([], {day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit'});
     let durationStr = 'Отменён';
     
     if (call.duration > 0) {
       const minutes = Math.floor(call.duration / 60);
       const seconds = call.duration % 60;
       durationStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
     }
     
     const icon = call.call_type === 'video' ? '<i class="fas fa-video"></i>' : '<i class="fas fa-phone-alt"></i>';
     const arrow = isOutgoing 
        ? '<i class="fas fa-arrow-right" style="color: #34d399; font-size:12px; margin-right:4px;"></i>' 
        : '<i class="fas fa-arrow-left" style="color: #ef4444; font-size:12px; margin-right:4px;"></i>';
     
     const durationColor = (call.duration === 0 && !isOutgoing) ? '#ef4444' : 'white';

     const li = document.createElement('li');
     li.className = 'chat-item'; 
     li.innerHTML = `
       <div class="chat-avatar" style="${avatarStyle}">${avatarContent}</div>
       <div class="chat-info">
         <span class="chat-name">${title}</span>
         <span class="chat-preview">${arrow} ${icon} <span style="margin-left:4px;">${date}</span></span>
       </div>
       <div class="chat-meta" style="align-items: flex-end; justify-content: center;">
         <span style="color: ${durationColor}; font-weight: 500; font-size:14px;">${durationStr}</span>
       </div>
     `;
     callsList.appendChild(li);
  });
}

// Жёстко прячем окно диалога при запуске на телефонах
window.addEventListener('DOMContentLoaded', () => {
  if (window.innerWidth <= 960) {
    const chatArea = document.querySelector('.chat-area') as HTMLElement;
    // Если чат не выбран, скрываем его, чтобы остался только список чатов (sidebar)
    if (chatArea && !currentChatId) {
      chatArea.style.display = 'none';
    }
  }
});
